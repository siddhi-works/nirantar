/**
 * Record transfer encryption, following the scheme ABDM publishes for FHIR data (the "Fidelius" scheme):
 *   - Curve25519 key agreement. Public keys travel as uncompressed points, 04 || X || Y, 32-byte big-endian each, in the
 *     short Weierstrass form of the curve. (Node's X25519 works on the Montgomery form, so the keys are converted both ways.)
 *   - Each side also makes a 32-byte random nonce. The salt is the first 20 bytes of (nonce XOR nonce), the IV the last 12.
 *   - HKDF-SHA256 over the shared secret with that salt gives a 256-bit key; the data is sealed with AES-256-GCM.
 * Both sides make a fresh key pair for every transfer, so one leaked key exposes one bundle.
 * Written from ABDM's published implementation guidelines. It has not been run against ABDM's reference tool (Fidelius CLI):
 * that has to be done with its test vectors before real exchange. The curve arithmetic is checked in the tests.
 */
import { createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from 'node:crypto';

const P = (1n << 255n) - 19n;
const A = 486662n; // Montgomery curve y² = x³ + Ax² + x
const mod = (x: bigint) => ((x % P) + P) % P;
function pow(b: bigint, e: bigint): bigint { let r = 1n; b = mod(b); while (e > 0n) { if (e & 1n) r = mod(r * b); b = mod(b * b); e >>= 1n; } return r; }
const inv = (x: bigint) => pow(x, P - 2n);
const SHIFT = mod(A * inv(3n)); // Weierstrass x = u + A/3

/** The short Weierstrass form of Curve25519: y² = x³ + a·x + b. */
export const CURVE = { p: P, a: mod((3n - A * A) * inv(3n)), b: mod((2n * A ** 3n - 9n * A) * inv(27n)) };

/** A square root mod p (p ≡ 5 mod 8). Either root will do: the receiver only uses X. */
function sqrt(n: bigint): bigint {
  let r = pow(n, (P + 3n) / 8n);
  if (mod(r * r) !== mod(n)) r = mod(r * pow(2n, (P - 1n) / 4n));
  if (mod(r * r) !== mod(n)) throw new Error('not a point on the curve');
  return r;
}

const toBE = (x: bigint) => Buffer.from(x.toString(16).padStart(64, '0'), 'hex');
const fromBE = (b: Buffer) => BigInt('0x' + b.toString('hex'));
const toLE = (x: bigint) => Buffer.from(toBE(x)).reverse();
const fromLE = (b: Buffer) => fromBE(Buffer.from(b).reverse());

const SPKI_X25519 = Buffer.from('302a300506032b656e032100', 'hex');
const PKCS8_X25519 = Buffer.from('302e020100300506032b656e04220420', 'hex');

export interface KeyMaterial {
  cryptoAlg: 'ECDH';
  curve: 'Curve25519';
  dhPublicKey: { expiry: string; parameters: string; keyValue: string }; // keyValue: base64 of 04 || X || Y
  nonce: string; // base64, 32 bytes
}
export interface KeyPair { material: KeyMaterial; privateKey: string }

/** A fresh key pair and nonce. The private key must stay with its owner. */
export function generateKeyPair(now = new Date()): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  const u = fromLE(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32));
  const x = mod(u + SHIFT);
  const y = sqrt(mod(u ** 3n + A * u * u + u));
  const point = Buffer.concat([Buffer.from([0x04]), toBE(x), toBE(y)]);
  return {
    material: { cryptoAlg: 'ECDH', curve: 'Curve25519', dhPublicKey: { expiry: new Date(now.getTime() + 86_400_000).toISOString(), parameters: 'Curve25519/32byte random key', keyValue: point.toString('base64') }, nonce: randomBytes(32).toString('base64') },
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  };
}

/** Is this the encoding of a point on the curve (04 || X || Y)? */
export function onCurve(keyValue: string): boolean {
  const b = Buffer.from(keyValue, 'base64');
  if (b.length !== 65 || b[0] !== 0x04) return false;
  const x = fromBE(b.subarray(1, 33)); const y = fromBE(b.subarray(33));
  return mod(y * y) === mod(x ** 3n + CURVE.a * x + CURVE.b);
}

function agree(privateKey: string, peerKeyValue: string): Buffer {
  const peer = Buffer.from(peerKeyValue, 'base64');
  if (peer.length !== 65 || peer[0] !== 0x04 || !onCurve(peerKeyValue)) throw new Error('The other side’s public key is not valid.');
  const u = mod(fromBE(peer.subarray(1, 33)) - SHIFT);
  const secretU = diffieHellman({
    privateKey: createPrivateKey({ key: Buffer.concat([PKCS8_X25519, Buffer.from(privateKey, 'base64').subarray(-32)]), format: 'der', type: 'pkcs8' }),
    publicKey: createPublicKey({ key: Buffer.concat([SPKI_X25519, toLE(u)]), format: 'der', type: 'spki' }),
  });
  return toBE(mod(fromLE(secretU) + SHIFT)); // the shared secret is the X coordinate, big-endian
}

/** Salt (20 bytes) and IV (12 bytes) from the two nonces, as ABDM specifies. */
export function saltAndIv(nonceA: string, nonceB: string): { salt: Buffer; iv: Buffer } {
  const a = Buffer.from(nonceA, 'base64'); const b = Buffer.from(nonceB, 'base64');
  if (a.length !== 32 || b.length !== 32) throw new Error('A nonce must be 32 bytes.');
  const x = Buffer.alloc(32); for (let i = 0; i < 32; i++) x[i] = a[i] ^ b[i];
  return { salt: x.subarray(0, 20), iv: x.subarray(20) };
}

const sessionKey = (secret: Buffer, salt: Buffer) => Buffer.from(hkdfSync('sha256', secret, salt, Buffer.alloc(0), 32));

export interface Sealed { encryptedData: string; keyMaterial: KeyMaterial }

/** The sending hospital: encrypt for the receiver's key material. Returns what may travel, with the sender's own key material. */
export function seal(plaintext: string, receiver: KeyMaterial): Sealed {
  const sender = generateKeyPair();
  const { salt, iv } = saltAndIv(sender.material.nonce, receiver.nonce);
  const cipher = createCipheriv('aes-256-gcm', sessionKey(agree(sender.privateKey, receiver.dhPublicKey.keyValue), salt), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return { encryptedData: body.toString('base64'), keyMaterial: sender.material };
}

/** The receiving hospital: decrypt with its own private key and nonce. Throws if anything was changed in transit. */
export function open(sealed: Sealed, receiverPrivateKey: string, receiverNonce: string): string {
  const body = Buffer.from(sealed.encryptedData, 'base64');
  const { salt, iv } = saltAndIv(sealed.keyMaterial.nonce, receiverNonce);
  const decipher = createDecipheriv('aes-256-gcm', sessionKey(agree(receiverPrivateKey, sealed.keyMaterial.dhPublicKey.keyValue), salt), iv);
  decipher.setAuthTag(body.subarray(body.length - 16));
  return Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()]).toString('utf8');
}

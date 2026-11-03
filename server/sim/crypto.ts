/**
 * Record transfer encryption: X25519 key agreement, HKDF-SHA256, AES-256-GCM.
 * Both sides make a fresh key pair for every transfer, so one leaked key exposes one bundle.
 * The cipher choices follow the common ABDM pattern; the exact parameters still have to be confirmed against
 * NHA's reference library when real sandbox access arrives.
 */
import { createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from 'node:crypto';

const INFO = Buffer.from('nirantar-record-transfer-v1');

export interface KeyPair { publicKey: string; privateKey: string } // base64 DER (spki / pkcs8)

export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  };
}

function sharedKey(privateKey: string, peerPublicKey: string, salt: Buffer): Buffer {
  const secret = diffieHellman({
    privateKey: createPrivateKey({ key: Buffer.from(privateKey, 'base64'), type: 'pkcs8', format: 'der' }),
    publicKey: createPublicKey({ key: Buffer.from(peerPublicKey, 'base64'), type: 'spki', format: 'der' }),
  });
  return Buffer.from(hkdfSync('sha256', secret, salt, INFO, 32));
}

export interface Sealed { ciphertext: string; iv: string; salt: string; senderPublicKey: string }

/** Encrypt for a receiver's public key. Returns what may travel through the gateway. */
export function seal(plaintext: string, receiverPublicKey: string): Sealed {
  const sender = generateKeyPair();
  const salt = randomBytes(32); const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sharedKey(sender.privateKey, receiverPublicKey, salt), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return { ciphertext: body.toString('base64'), iv: iv.toString('base64'), salt: salt.toString('base64'), senderPublicKey: sender.publicKey };
}

/** Decrypt with the receiver's private key. Throws if anything was changed in transit. */
export function open(sealed: Sealed, receiverPrivateKey: string): string {
  const body = Buffer.from(sealed.ciphertext, 'base64');
  const tag = body.subarray(body.length - 16); const data = body.subarray(0, body.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', sharedKey(receiverPrivateKey, sealed.senderPublicKey, Buffer.from(sealed.salt, 'base64')), Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

import { describe, expect, it } from 'vitest';
import { CURVE, generateKeyPair, onCurve, open, saltAndIv, seal } from './crypto';

describe('record transfer encryption (ABDM’s scheme)', () => {
  const text = JSON.stringify({ resourceType: 'Bundle', note: 'HbA1c 6.5 for Mr. Rajesh Kumar Singh' });

  it('makes public keys that are real points on Curve25519, in the 04 || X || Y form ABDM uses', () => {
    for (let i = 0; i < 20; i++) {
      const k = generateKeyPair();
      const raw = Buffer.from(k.material.dhPublicKey.keyValue, 'base64');
      expect(raw.length).toBe(65);
      expect(raw[0]).toBe(0x04);
      expect(onCurve(k.material.dhPublicKey.keyValue)).toBe(true);
      expect(Buffer.from(k.material.nonce, 'base64').length).toBe(32);
    }
    expect(CURVE.p).toBe((1n << 255n) - 19n);
    const bad = Buffer.from(generateKeyPair().material.dhPublicKey.keyValue, 'base64'); bad[40] ^= 1;
    expect(onCurve(bad.toString('base64'))).toBe(false);
  });

  it('derives the salt (20 bytes) and IV (12 bytes) from the two nonces by XOR', () => {
    const a = Buffer.alloc(32, 0xf0); const b = Buffer.alloc(32); for (let i = 0; i < 32; i++) b[i] = i;
    const { salt, iv } = saltAndIv(a.toString('base64'), b.toString('base64'));
    expect(salt.length).toBe(20); expect(iv.length).toBe(12);
    const x = Buffer.alloc(32); for (let i = 0; i < 32; i++) x[i] = a[i] ^ b[i];
    expect(salt.equals(x.subarray(0, 20))).toBe(true);
    expect(iv.equals(x.subarray(20))).toBe(true);
    expect(saltAndIv(b.toString('base64'), a.toString('base64')).iv.equals(iv)).toBe(true); // the same from either side
    expect(() => saltAndIv('AAAA', b.toString('base64'))).toThrow();
  });

  it('round-trips between a sender and the receiver’s key material', () => {
    const receiver = generateKeyPair();
    expect(open(seal(text, receiver.material), receiver.privateKey, receiver.material.nonce)).toBe(text);
  });

  it('hides the content in transit', () => {
    const s = seal(text, generateKeyPair().material);
    expect(Buffer.from(s.encryptedData, 'base64').toString('utf8')).not.toContain('HbA1c');
    expect(JSON.stringify(s)).not.toContain('Rajesh');
  });

  it('uses a fresh key and nonce every time', () => {
    const r = generateKeyPair();
    const a = seal(text, r.material); const b = seal(text, r.material);
    expect(a.encryptedData).not.toBe(b.encryptedData);
    expect(a.keyMaterial.dhPublicKey.keyValue).not.toBe(b.keyMaterial.dhPublicKey.keyValue);
    expect(a.keyMaterial.nonce).not.toBe(b.keyMaterial.nonce);
  });

  it('cannot be read with anyone else’s key, or the wrong nonce', () => {
    const r = generateKeyPair();
    const s = seal(text, r.material);
    expect(() => open(s, generateKeyPair().privateKey, r.material.nonce)).toThrow();
    expect(() => open(s, r.privateKey, generateKeyPair().material.nonce)).toThrow();
  });

  it('rejects data changed in transit, and a public key that is not on the curve', () => {
    const r = generateKeyPair();
    const s = seal(text, r.material);
    const body = Buffer.from(s.encryptedData, 'base64'); body[3] ^= 0x01;
    expect(() => open({ ...s, encryptedData: body.toString('base64') }, r.privateKey, r.material.nonce)).toThrow();
    const tag = Buffer.from(s.encryptedData, 'base64'); tag[tag.length - 1] ^= 0x01;
    expect(() => open({ ...s, encryptedData: tag.toString('base64') }, r.privateKey, r.material.nonce)).toThrow();
    const pk = Buffer.from(s.keyMaterial.dhPublicKey.keyValue, 'base64'); pk[50] ^= 0x01;
    expect(() => open({ ...s, keyMaterial: { ...s.keyMaterial, dhPublicKey: { ...s.keyMaterial.dhPublicKey, keyValue: pk.toString('base64') } } }, r.privateKey, r.material.nonce)).toThrow(/not valid/);
    expect(() => seal(text, { ...r.material, dhPublicKey: { ...r.material.dhPublicKey, keyValue: pk.toString('base64') } })).toThrow(/not valid/);
  });
});

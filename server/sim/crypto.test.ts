import { describe, expect, it } from 'vitest';
import { generateKeyPair, open, seal } from './crypto';

describe('record transfer encryption', () => {
  const text = JSON.stringify({ resourceType: 'Bundle', note: 'HbA1c 6.5 for Mr. Rajesh Kumar Singh' });

  it('round-trips between a sender and the receiver\'s key', () => {
    const receiver = generateKeyPair();
    expect(open(seal(text, receiver.publicKey), receiver.privateKey)).toBe(text);
  });

  it('hides the content in transit', () => {
    const s = seal(text, generateKeyPair().publicKey);
    const raw = Buffer.from(s.ciphertext, 'base64').toString('utf8');
    expect(raw).not.toContain('HbA1c');
    expect(JSON.stringify(s)).not.toContain('Rajesh');
  });

  it('uses a fresh key and nonce every time', () => {
    const r = generateKeyPair();
    const a = seal(text, r.publicKey); const b = seal(text, r.publicKey);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.senderPublicKey).not.toBe(b.senderPublicKey);
    expect(a.iv).not.toBe(b.iv);
  });

  it('cannot be read with anyone else\'s key', () => {
    const s = seal(text, generateKeyPair().publicKey);
    expect(() => open(s, generateKeyPair().privateKey)).toThrow();
  });

  it('rejects a bundle changed in transit', () => {
    const r = generateKeyPair();
    const s = seal(text, r.publicKey);
    const body = Buffer.from(s.ciphertext, 'base64'); body[3] ^= 0x01;
    expect(() => open({ ...s, ciphertext: body.toString('base64') }, r.privateKey)).toThrow();
    const tagFlip = Buffer.from(s.ciphertext, 'base64'); tagFlip[tagFlip.length - 1] ^= 0x01;
    expect(() => open({ ...s, ciphertext: tagFlip.toString('base64') }, r.privateKey)).toThrow();
    expect(() => open({ ...s, salt: Buffer.alloc(32, 1).toString('base64') }, r.privateKey)).toThrow();
  });
});

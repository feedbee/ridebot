import { encrypt, decrypt } from '../../utils/encryption.js';

describe('encrypt / decrypt', () => {
  const SECRET = 'super-secret-key';
  const PLAINTEXT = JSON.stringify({ accessToken: 'abc123', refreshToken: 'rf456', expiresAt: 9999 });

  test('encrypts to a base64 string', () => {
    const result = encrypt(PLAINTEXT, SECRET);
    expect(typeof result).toBe('string');
    // Must be valid base64
    expect(() => Buffer.from(result, 'base64')).not.toThrow();
    // Must not contain the original plaintext
    expect(result).not.toContain(PLAINTEXT);
  });

  test('decrypts back to the original plaintext', () => {
    const encrypted = encrypt(PLAINTEXT, SECRET);
    const decrypted = decrypt(encrypted, SECRET);
    expect(decrypted).toBe(PLAINTEXT);
  });

  test('produces different ciphertext each time (random IV)', () => {
    const a = encrypt(PLAINTEXT, SECRET);
    const b = encrypt(PLAINTEXT, SECRET);
    expect(a).not.toBe(b);
    // Both still decrypt correctly
    expect(decrypt(a, SECRET)).toBe(PLAINTEXT);
    expect(decrypt(b, SECRET)).toBe(PLAINTEXT);
  });

  test('throws when decrypting with a wrong secret (auth tag mismatch)', () => {
    const encrypted = encrypt(PLAINTEXT, SECRET);
    expect(() => decrypt(encrypted, 'wrong-secret')).toThrow();
  });

  test('throws when decrypting tampered ciphertext', () => {
    const encrypted = encrypt(PLAINTEXT, SECRET);
    const buf = Buffer.from(encrypted, 'base64');
    buf[buf.length - 1] ^= 0xff; // flip last byte of ciphertext
    const tampered = buf.toString('base64');
    expect(() => decrypt(tampered, SECRET)).toThrow();
  });

  test('works with empty plaintext', () => {
    const enc = encrypt('', SECRET);
    expect(decrypt(enc, SECRET)).toBe('');
  });

  test('works with unicode content', () => {
    const unicode = '{"name":"Велосипед 🚴","emoji":"✅"}';
    const enc = encrypt(unicode, SECRET);
    expect(decrypt(enc, SECRET)).toBe(unicode);
  });
});

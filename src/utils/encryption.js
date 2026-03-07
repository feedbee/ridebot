import crypto from 'crypto';

/**
 * Derives a 256-bit AES key from an arbitrary secret string using SHA-256.
 * @param {string} secret
 * @returns {Buffer} 32-byte key
 */
function deriveKey(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a plaintext string with AES-256-GCM.
 * Output format (base64): IV (12 bytes) | AuthTag (16 bytes) | Ciphertext
 * @param {string} plaintext
 * @param {string} secret  Any string; key is derived via SHA-256
 * @returns {string} base64-encoded encrypted blob
 */
export function encrypt(plaintext, secret) {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypts a base64-encoded blob produced by {@link encrypt}.
 * @param {string} base64Data
 * @param {string} secret  Must be the same secret used during encryption
 * @returns {string} plaintext
 * @throws If the data is tampered or the wrong secret is used
 */
export function decrypt(base64Data, secret) {
  const key = deriveKey(secret);
  const buf = Buffer.from(base64Data, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8');
}

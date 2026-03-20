import nacl from "tweetnacl";
import { createHash } from "node:crypto";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Derives a 32-byte encryption key from a hex token using SHA-512.
 * The token is already 256-bit random, so no password stretching is needed.
 */
export function deriveEncryptionKey(tokenHex: string): Uint8Array {
  const hash = createHash("sha512").update(tokenHex, "utf-8").digest();
  return new Uint8Array(hash).slice(0, 32);
}

/**
 * Encrypts a plaintext string using NaCl secretbox (XSalsa20-Poly1305).
 * Returns a base64 string containing: nonce (24 bytes) || ciphertext.
 */
export function encrypt(plaintext: string, key: Uint8Array): string {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const message = encoder.encode(plaintext);
  const box = nacl.secretbox(message, nonce, key);
  const full = new Uint8Array(nonce.length + box.length);
  full.set(nonce);
  full.set(box, nonce.length);
  return Buffer.from(full).toString("base64");
}

/**
 * Decrypts a base64-encoded ciphertext using NaCl secretbox.
 * Expects format: base64(nonce (24 bytes) || ciphertext).
 * Throws if decryption fails (wrong key or tampered data).
 */
export function decrypt(ciphertext: string, key: Uint8Array): string {
  const full = new Uint8Array(Buffer.from(ciphertext, "base64"));
  const nonce = full.subarray(0, nacl.secretbox.nonceLength);
  const box = full.subarray(nacl.secretbox.nonceLength);
  const decrypted = nacl.secretbox.open(box, nonce, key);
  if (!decrypted) throw new Error("Decryption failed");
  return decoder.decode(decrypted);
}

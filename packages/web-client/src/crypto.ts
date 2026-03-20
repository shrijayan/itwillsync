import nacl from "tweetnacl";

/**
 * Derives a 32-byte encryption key from a hex token using SHA-512.
 * Uses tweetnacl's pure-JS SHA-512 (nacl.hash) instead of Web Crypto API
 * because crypto.subtle is unavailable in non-secure contexts (HTTP on mobile).
 */
export function deriveEncryptionKey(tokenHex: string): Uint8Array {
  const data = new TextEncoder().encode(tokenHex);
  const hash = nacl.hash(data); // Pure-JS SHA-512, returns 64-byte Uint8Array
  return hash.slice(0, 32);
}

/**
 * Encrypts a plaintext string using NaCl secretbox (XSalsa20-Poly1305).
 * Returns a base64 string containing: nonce (24 bytes) || ciphertext.
 */
export function encrypt(plaintext: string, key: Uint8Array): string {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const message = new TextEncoder().encode(plaintext);
  const box = nacl.secretbox(message, nonce, key);
  const full = new Uint8Array(nonce.length + box.length);
  full.set(nonce);
  full.set(box, nonce.length);
  // Convert to base64 using browser-native API
  let binary = "";
  for (let i = 0; i < full.length; i++) {
    binary += String.fromCharCode(full[i]);
  }
  return btoa(binary);
}

/**
 * Decrypts a base64-encoded ciphertext using NaCl secretbox.
 * Expects format: base64(nonce (24 bytes) || ciphertext).
 * Throws if decryption fails (wrong key or tampered data).
 */
export function decrypt(ciphertext: string, key: Uint8Array): string {
  const binary = atob(ciphertext);
  const full = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    full[i] = binary.charCodeAt(i);
  }
  const nonce = full.slice(0, nacl.secretbox.nonceLength);
  const box = full.slice(nacl.secretbox.nonceLength);
  const decrypted = nacl.secretbox.open(box, nonce, key);
  if (!decrypted) throw new Error("Decryption failed");
  return new TextDecoder().decode(decrypted);
}

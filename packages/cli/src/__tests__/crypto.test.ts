import { describe, it, expect } from "vitest";
import { deriveEncryptionKey, encrypt, decrypt } from "../crypto.js";
import { randomBytes } from "node:crypto";
import nacl from "tweetnacl";

describe("deriveEncryptionKey", () => {
  it("returns a 32-byte Uint8Array", () => {
    const key = deriveEncryptionKey("abcdef1234567890");
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it("is deterministic — same token produces same key", () => {
    const token = randomBytes(32).toString("hex");
    const key1 = deriveEncryptionKey(token);
    const key2 = deriveEncryptionKey(token);
    expect(key1).toEqual(key2);
  });

  it("different tokens produce different keys", () => {
    const key1 = deriveEncryptionKey(randomBytes(32).toString("hex"));
    const key2 = deriveEncryptionKey(randomBytes(32).toString("hex"));
    expect(key1).not.toEqual(key2);
  });

  it("matches nacl.hash (browser-compatible) key derivation", () => {
    // Verify Node.js createHash("sha512") and nacl.hash() produce the same key.
    // This ensures the browser crypto module (which uses nacl.hash) is compatible.
    const token = randomBytes(32).toString("hex");
    const nodeKey = deriveEncryptionKey(token);
    const data = new TextEncoder().encode(token);
    const naclHash = nacl.hash(data);
    const browserKey = naclHash.slice(0, 32);
    expect(nodeKey).toEqual(browserKey);
  });
});

describe("encrypt / decrypt", () => {
  const token = randomBytes(32).toString("hex");
  const key = deriveEncryptionKey(token);

  it("round-trips a simple string", () => {
    const plaintext = "hello world";
    const ciphertext = encrypt(plaintext, key);
    expect(decrypt(ciphertext, key)).toBe(plaintext);
  });

  it("round-trips an empty string", () => {
    const ciphertext = encrypt("", key);
    expect(decrypt(ciphertext, key)).toBe("");
  });

  it("round-trips JSON messages", () => {
    const msg = JSON.stringify({ type: "data", data: "ls -la\n", seq: 42 });
    const ciphertext = encrypt(msg, key);
    expect(decrypt(ciphertext, key)).toBe(msg);
  });

  it("round-trips unicode content", () => {
    const plaintext = "Hello \u{1F600} \u{1F4BB} \u00E9\u00E8\u00EA";
    const ciphertext = encrypt(plaintext, key);
    expect(decrypt(ciphertext, key)).toBe(plaintext);
  });

  it("round-trips a large payload (100KB)", () => {
    const plaintext = "x".repeat(100_000);
    const ciphertext = encrypt(plaintext, key);
    expect(decrypt(ciphertext, key)).toBe(plaintext);
  });

  it("produces different ciphertext for the same plaintext (random nonce)", () => {
    const plaintext = "same message";
    const ct1 = encrypt(plaintext, key);
    const ct2 = encrypt(plaintext, key);
    expect(ct1).not.toBe(ct2);
  });

  it("ciphertext is base64-encoded", () => {
    const ciphertext = encrypt("test", key);
    // Base64 regex: alphanumeric, +, /, optional = padding
    expect(ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("throws on decryption with wrong key", () => {
    const wrongKey = deriveEncryptionKey(randomBytes(32).toString("hex"));
    const ciphertext = encrypt("secret", key);
    expect(() => decrypt(ciphertext, wrongKey)).toThrow("Decryption failed");
  });

  it("throws on tampered ciphertext", () => {
    const ciphertext = encrypt("secret", key);
    // Flip a character in the middle of the ciphertext
    const tampered = ciphertext.slice(0, 30) + "X" + ciphertext.slice(31);
    expect(() => decrypt(tampered, key)).toThrow();
  });
});

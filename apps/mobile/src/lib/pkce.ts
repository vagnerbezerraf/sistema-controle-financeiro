import * as Crypto from 'expo-crypto';

/**
 * Gera um `code_verifier` aleatorio (hex) para o PKCE. O formato hexadecimal
 * atende ao conjunto de caracteres permitido pela RFC 7636 (A-Z a-z 0-9 -._~).
 */
export function randomString(byteLength = 32): string {
  const bytes = Crypto.getRandomBytes(byteLength);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Calcula o `code_challenge` = base64url(SHA-256(verifier)) sem padding. */
export async function sha256Challenge(verifier: string): Promise<string> {
  const base64 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

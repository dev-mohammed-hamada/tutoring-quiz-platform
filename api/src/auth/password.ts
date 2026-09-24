import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// scrypt ships with Node, so there is no native module to build in the image.
const scryptAsync = promisify(scrypt) as (p: string, s: Buffer, k: number) => Promise<Buffer>;
const KEYLEN = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(plain, salt, KEYLEN);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  if (expected.length === 0) return false;
  const actual = await scryptAsync(plain, Buffer.from(saltB64, 'base64'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * A real hash of a throwaway password, used to burn the same CPU when the login
 * code does not exist. Without it, a missing user returns noticeably faster than
 * a wrong password and the response time leaks the roster.
 */
let dummyHash: string | null = null;
export async function burnVerifyTime(plain: string): Promise<false> {
  dummyHash ??= await hashPassword('timing-equalisation-placeholder');
  await verifyPassword(plain, dummyHash);
  return false;
}

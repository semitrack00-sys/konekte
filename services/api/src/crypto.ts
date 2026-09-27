import { createCipheriv, createDecipheriv, randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string) {
  const [, salt, expected] = hash.split(':');
  if (!salt || !expected) return false;
  const actual = await derive(password, salt, 64) as Buffer;
  const stored = Buffer.from(expected, 'hex');
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newRefreshToken = () => randomBytes(48).toString('base64url');
export function encrypt(value: unknown, key: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join('.');
}
export function decrypt(value: string, key: string, context: string): unknown {
  const [version, iv, tag, body] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('Invalid encrypted value');
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(iv, 'base64'));
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(body, 'base64')), cipher.final()]).toString('utf8')) as unknown;
}

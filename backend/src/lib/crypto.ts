import crypto from 'crypto';

// ── Password hashing (PBKDF2 / SHA-256) ─────────────────────────────────────

const ITERATIONS = 100_000;
const KEYLEN = 64;
const DIGEST = 'sha256';
const SALT_BYTES = 32;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST).toString('hex');
  return `pbkdf2:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored.startsWith('pbkdf2:')) return false;
  const parts = stored.split(':');
  if (parts.length !== 3) return false;
  const [, salt, expectedHash] = parts;
  const derived = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(expectedHash, 'hex'));
  } catch {
    return false;
  }
}

// ── AES-256-GCM field encryption ────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const IV_LEN = 16;
const PREFIX = 'enc:';

function encKey(): Buffer {
  const k = process.env.AES_ENCRYPTION_KEY ?? '';
  if (k.length < 32) throw new Error('AES_ENCRYPTION_KEY must be at least 32 characters');
  return Buffer.from(k.slice(0, 32), 'utf8');
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, encKey(), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString('hex'), tag.toString('hex'), body.toString('hex')].join(':');
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext.startsWith(PREFIX)) return ciphertext;
  const payload = ciphertext.slice(PREFIX.length);
  const [ivHex, tagHex, bodyHex] = payload.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const body = Buffer.from(bodyHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, encKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

export function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return decrypt(value); } catch { return value; }
}

export function maybeEncrypt(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return encrypt(value);
}

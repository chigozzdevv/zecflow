import crypto from 'crypto';
import { envConfig } from '@/config/env';

const SECRET_PREFIX = 'enc:';
const key = crypto.createHash('sha256').update(envConfig.ENCRYPTION_KEY).digest();

export const encryptValue = (value: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${SECRET_PREFIX}${Buffer.concat([iv, authTag, encrypted]).toString('base64')}`;
};

export const decryptValue = (value: string): string => {
  if (!value.startsWith(SECRET_PREFIX)) {
    return value;
  }
  const payload = Buffer.from(value.replace(SECRET_PREFIX, ''), 'base64');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
};

export const maskValue = (value: string): string => {
  return value.startsWith(SECRET_PREFIX) ? '******' : value;
};

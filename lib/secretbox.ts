// AES-256-GCM for small secrets stored in the database (TOTP seeds). The key (APP_SECRET_KEY, 32 bytes base64)
// lives in a Kubernetes Secret, so a database dump alone does not reveal them.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const key = () => {
  const k = Buffer.from(process.env.APP_SECRET_KEY ?? '', 'base64');
  if (k.length !== 32) throw new Error('APP_SECRET_KEY must be 32 bytes, base64');
  return k;
};
export function seal(plain: string, context: string) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key(), iv);
  c.setAAD(Buffer.from(context));
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), data.toString('base64url')].join(':');
}
export function open(sealed: string, context: string) {
  const [v, iv, tag, data] = sealed.split(':');
  if (v !== 'v1') throw new Error('bad sealed value');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAAD(Buffer.from(context)); d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}

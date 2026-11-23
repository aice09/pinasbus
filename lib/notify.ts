// Notifications: in-app rows for account holders, plus an email outbox flushed by the background job (lib/jobs.ts).
// Writing to the outbox in the same request (instead of sending inline) means a slow or failing SMTP server never
// breaks a payment or a booking; the job retries.
import nodemailer, { type Transporter } from 'nodemailer';
import { q } from './db.ts';

export type Note = { kind: string; title: string; body?: string; link?: string };
const base = () => process.env.PUBLIC_BASE_URL ?? 'https://pinasbus.phlopentech.org';

/** Notify account holders (in-app + email) and/or plain email addresses (guests). */
export async function notify(target: { userIds?: (string | null | undefined)[]; emails?: string[] }, n: Note, email = true) {
  const ids = [...new Set((target.userIds ?? []).filter(Boolean) as string[])];
  const users = ids.length ? await q<{ id: string; email: string }>('select id, email from users where id = any($1) and not disabled', [ids]) : [];
  for (const u of users) await q('insert into notifications (user_id, kind, title, body, link) values ($1,$2,$3,$4,$5)', [u.id, n.kind, n.title, n.body ?? '', n.link ?? '']);
  if (!email) return;
  const to = new Set([...users.map((u) => u.email), ...(target.emails ?? [])].map((e) => e.toLowerCase()).filter((e) => e.includes('@') && !(process.env.MAIL_SKIP_TEST_DOMAINS === 'true' && e.endsWith('.test'))));
  const text = `${n.body ?? ''}${n.link ? `\n\n${base()}${n.link}` : ''}\n\n— PINASBUS`;
  for (const e of to) await q('insert into outbox (to_email, subject, body) values ($1,$2,$3)', [e, n.title, text]);
}

let transport: Transporter | null = null;
const mailer = () => (transport ??= process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null);

/** Sends up to 20 queued emails. Called by the job runner; safe to call concurrently (row locks). */
export async function flushOutbox() {
  const t = mailer();
  if (!t) return 0;
  const rows = await q<{ id: number; to_email: string; subject: string; body: string }>(
    `update outbox set attempts = attempts + 1 where id in (
       select id from outbox where sent_at is null and attempts < 5 order by id limit 20 for update skip locked) returning id, to_email, subject, body`);
  for (const r of rows) {
    try {
      await t.sendMail({ from: process.env.MAIL_FROM ?? 'PINASBUS <no-reply@pinasbus.phlopentech.org>', to: r.to_email, subject: r.subject, text: r.body });
      await q('update outbox set sent_at = now() where id = $1', [r.id]);
    } catch (e) {
      await q('update outbox set last_error = $2 where id = $1', [r.id, (e as Error).message.slice(0, 300)]);
    }
  }
  return rows.length;
}

export const unreadCount = async (userId: string) => (await q<{ n: number }>('select count(*)::int n from notifications where user_id = $1 and read_at is null', [userId]))[0].n;

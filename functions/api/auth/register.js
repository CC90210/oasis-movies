// POST /api/auth/register — create an account.
// Body: { email, password } → { token, user } | 409 on duplicate.

import { json, hashPassword, createSession, newId, isoNow, capabilitiesFor } from '../../lib/auth.js';
import { tursoQuery, tursoExec } from '../../lib/turso.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!EMAIL_RE.test(email)) return json({ error: 'invalid_email' }, 400);
  if (password.length < 8) return json({ error: 'password_too_short', min: 8 }, 400);

  const existing = await tursoQuery(env, 'SELECT id FROM oasis_movies_users WHERE email = ?', [email]);
  if (existing.length > 0) return json({ error: 'email_taken' }, 409);

  const { salt, hash } = await hashPassword(password);
  const id = newId('usr');
  const now = isoNow();

  await tursoExec(env, [
    {
      sql: "INSERT INTO oasis_movies_users (id, email, password_hash, salt, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'user', ?, ?)",
      args: [id, email, hash, salt, now, now],
    },
  ]);

  const token = await createSession(env, id);
  return json({ token, user: { id, email, role: 'user', capabilities: capabilitiesFor('user') } }, 201);
}

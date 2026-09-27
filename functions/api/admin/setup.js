// POST /api/admin/setup — first-time admin onboarding / admin password reset.
// Gated by the ADMIN_SETUP_KEY Pages secret; returns 503 when the secret is unset.
// Body: { key, email, password } → { token, user, created }
// An existing account with that email is promoted to admin, its password is
// replaced, and all of its previous sessions are revoked.

import { json, hashPassword, createSession, newId, isoNow, capabilitiesFor } from '../../lib/auth.js';
import { tursoQuery, tursoExec } from '../../lib/turso.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_ADMIN_PASSWORD = 12;

// Compare SHA-256 digests so the check is constant-time regardless of input length.
async function setupKeyMatches(provided, expected) {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(provided)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_SETUP_KEY) return json({ error: 'setup_disabled' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const key = String(body.key || '');
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!key || !(await setupKeyMatches(key, env.ADMIN_SETUP_KEY))) {
    return json({ error: 'invalid_setup_key' }, 403);
  }
  if (!EMAIL_RE.test(email)) return json({ error: 'invalid_email' }, 400);
  if (password.length < MIN_ADMIN_PASSWORD) {
    return json({ error: 'password_too_short', min: MIN_ADMIN_PASSWORD }, 400);
  }

  const existing = await tursoQuery(env, 'SELECT id FROM oasis_movies_users WHERE email = ?', [email]);
  const { salt, hash } = await hashPassword(password);
  const now = isoNow();
  let userId;

  if (existing.length > 0) {
    userId = existing[0].id;
    await tursoExec(env, [
      {
        sql: "UPDATE oasis_movies_users SET password_hash = ?, salt = ?, role = 'admin', updated_at = ? WHERE id = ?",
        args: [hash, salt, now, userId],
      },
      { sql: 'DELETE FROM oasis_movies_sessions WHERE user_id = ?', args: [userId] },
    ]);
  } else {
    userId = newId('usr');
    await tursoExec(env, [
      {
        sql: "INSERT INTO oasis_movies_users (id, email, password_hash, salt, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'admin', ?, ?)",
        args: [userId, email, hash, salt, now, now],
      },
    ]);
  }

  const token = await createSession(env, userId);
  return json({
    token,
    created: existing.length === 0,
    user: { id: userId, email, role: 'admin', capabilities: capabilitiesFor('admin') },
  });
}

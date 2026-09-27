// POST /api/auth/login — verify credentials, issue a session token.
// Body: { email, password } → { token, user } | 401 on bad credentials.

import { json, verifyPassword, createSession, capabilitiesFor } from '../../lib/auth.js';
import { tursoQuery } from '../../lib/turso.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  const rows = await tursoQuery(
    env,
    'SELECT id, email, password_hash, salt, role FROM oasis_movies_users WHERE email = ?',
    [email]
  );
  const user = rows[0];

  // Uniform failure — do not reveal whether the email exists.
  if (!user || !(await verifyPassword(password, user.salt, user.password_hash))) {
    return json({ error: 'invalid_credentials' }, 401);
  }

  const token = await createSession(env, user.id);
  return json({
    token,
    user: { id: user.id, email: user.email, role: user.role, capabilities: capabilitiesFor(user.role) },
  });
}

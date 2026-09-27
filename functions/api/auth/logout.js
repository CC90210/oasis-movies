// POST /api/auth/logout — invalidate the caller's session token.

import { json } from '../../lib/auth.js';
import { tursoExec } from '../../lib/turso.js';

export async function onRequestPost({ request, env }) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return json({ error: 'unauthorized' }, 401);

  await tursoExec(env, [
    { sql: 'DELETE FROM oasis_movies_sessions WHERE token = ?', args: [token] },
  ]);
  return json({ ok: true });
}

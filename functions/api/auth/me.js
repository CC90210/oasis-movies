// GET /api/auth/me — resolve the Bearer token to the current user.
// → { user: { id, email, role, capabilities } } | 401

import { json, getSessionUser } from '../../lib/auth.js';

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'unauthorized' }, 401);

  return json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      capabilities: user.capabilities,
    },
  });
}

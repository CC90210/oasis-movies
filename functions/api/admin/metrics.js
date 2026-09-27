// GET /api/admin/metrics — real account/usage metrics from Turso.
// Admin role required; everyone else gets 403.

import { json, getSessionUser } from '../../lib/auth.js';
import { tursoQuery } from '../../lib/turso.js';

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'unauthorized' }, 401);
  if (user.role !== 'admin') return json({ error: 'forbidden' }, 403);

  const scalar = async (sql, args = []) => {
    const rows = await tursoQuery(env, sql, args);
    return Number(Object.values(rows[0] || { n: 0 })[0]) || 0;
  };

  const [totalUsers, vip, activeSessions, watchlistItems, activeSubscriptions, recentUsers] =
    await Promise.all([
      scalar('SELECT COUNT(*) AS n FROM oasis_movies_users'),
      scalar("SELECT COUNT(*) AS n FROM oasis_movies_users WHERE role IN ('vip', 'admin')"),
      scalar('SELECT COUNT(*) AS n FROM oasis_movies_sessions WHERE expires_at > ?', [
        new Date().toISOString(),
      ]),
      scalar('SELECT COUNT(*) AS n FROM oasis_movies_watchlists'),
      scalar("SELECT COUNT(*) AS n FROM oasis_movies_subscriptions WHERE status = 'active'"),
      tursoQuery(
        env,
        'SELECT email, role, created_at FROM oasis_movies_users ORDER BY created_at DESC LIMIT 10'
      ),
    ]);

  return json({
    generated_at: new Date().toISOString(),
    users: { total: totalUsers, vip },
    sessions: { active: activeSessions },
    watchlist: { items: watchlistItems },
    subscriptions: { active: activeSubscriptions },
    recent_signups: recentUsers,
  });
}


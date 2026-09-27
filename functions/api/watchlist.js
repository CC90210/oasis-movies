// /api/watchlist — cloud watchlist sync (VIP / admin accounts).
// GET                → { items: [...] }
// POST   { tmdb_id, media_type, title, poster_path? }  → upsert one item
// DELETE ?tmdb_id=&media_type=                          → remove one item
//
// Cloud sync is an account-tier feature: role 'user' stays on browser
// localStorage and gets 403 { error: 'upgrade_required' }.

import { json, getSessionUser, newId, isoNow } from '../lib/auth.js';
import { tursoQuery, tursoExec } from '../lib/turso.js';

async function authorize(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return { error: json({ error: 'unauthorized' }, 401) };
  if (!user.capabilities.cloudWatchlist) {
    return { error: json({ error: 'upgrade_required', feature: 'cloud_watchlist' }, 403) };
  }
  return { user };
}

export async function onRequestGet({ request, env }) {
  const { user, error } = await authorize(request, env);
  if (error) return error;

  const items = await tursoQuery(
    env,
    'SELECT tmdb_id, media_type, title, poster_path, added_at FROM oasis_movies_watchlists WHERE user_id = ? ORDER BY added_at DESC',
    [user.id]
  );
  return json({ items });
}

export async function onRequestPost({ request, env }) {
  const { user, error } = await authorize(request, env);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const tmdbId = parseInt(body.tmdb_id, 10);
  const mediaType = String(body.media_type || '');
  const title = String(body.title || '').trim();
  const posterPath = body.poster_path ? String(body.poster_path) : null;

  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return json({ error: 'invalid_tmdb_id' }, 400);
  if (!['movie', 'tv'].includes(mediaType)) return json({ error: 'invalid_media_type' }, 400);
  if (!title) return json({ error: 'title_required' }, 400);

  await tursoExec(env, [
    {
      sql: `INSERT INTO oasis_movies_watchlists (id, user_id, tmdb_id, media_type, title, poster_path, added_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (user_id, tmdb_id, media_type) DO UPDATE SET title = excluded.title, poster_path = excluded.poster_path`,
      args: [newId('wl'), user.id, tmdbId, mediaType, title, posterPath, isoNow()],
    },
  ]);
  return json({ ok: true }, 201);
}

export async function onRequestDelete({ request, env }) {
  const { user, error } = await authorize(request, env);
  if (error) return error;

  const url = new URL(request.url);
  const tmdbId = parseInt(url.searchParams.get('tmdb_id'), 10);
  const mediaType = url.searchParams.get('media_type') || '';
  if (!Number.isInteger(tmdbId) || !['movie', 'tv'].includes(mediaType)) {
    return json({ error: 'invalid_params' }, 400);
  }

  await tursoExec(env, [
    {
      sql: 'DELETE FROM oasis_movies_watchlists WHERE user_id = ? AND tmdb_id = ? AND media_type = ?',
      args: [user.id, tmdbId, mediaType],
    },
  ]);
  return json({ ok: true });
}

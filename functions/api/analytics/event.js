// POST /api/analytics/event — record a real factual event in Turso.
// Events: stream_start, ad_impression, page_view.

import { json, newId, isoNow } from '../../lib/auth.js';
import { tursoExec } from '../../lib/turso.js';

const ALLOWED_EVENTS = new Set(['stream_start', 'ad_impression', 'page_view']);

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const eventType = String(body.event_type || '');
  if (!ALLOWED_EVENTS.has(eventType)) {
    return json({ error: 'invalid_event_type' }, 400);
  }

  const tmdbId = typeof body.tmdb_id === 'number' ? body.tmdb_id : null;
  const title = body.title ? String(body.title).slice(0, 200) : null;
  const mediaType = body.media_type === 'tv' ? 'tv' : 'movie';
  const sessionId = body.session_id ? String(body.session_id).slice(0, 64) : null;
  const eventId = newId('evt');
  const now = isoNow();

  try {
    await tursoExec(env, [
      {
        sql: `INSERT INTO oasis_movies_events (id, event_type, tmdb_id, title, media_type, session_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [eventId, eventType, tmdbId, title, mediaType, sessionId, now],
      },
    ]);
    return json({ ok: true, id: eventId });
  } catch (err) {
    console.error('Failed to log event:', err);
    return json({ error: 'db_error' }, 500);
  }
}

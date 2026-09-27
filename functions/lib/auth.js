// Auth helpers for OasisMovies Pages Functions.
// Password format must stay in lockstep with scripts/seed_oasis_movies_admin.py:
// PBKDF2-HMAC-SHA256, 100_000 iterations, 32-byte derived key, hex-encoded,
// salt stored hex-encoded (the decoded bytes are the actual salt).

import { tursoQuery, tursoExec } from './turso.js';

export const PBKDF2_ITERATIONS = 100_000;
const SESSION_TTL_DAYS = 30;

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2Hex(password, saltBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: PBKDF2_ITERATIONS },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2Hex(password, salt);
  return { salt: bytesToHex(salt), hash };
}

function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  const ba = hexToBytes(a);
  const bb = hexToBytes(b);
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

export async function verifyPassword(password, saltHex, expectedHashHex) {
  const actual = await pbkdf2Hex(password, hexToBytes(saltHex));
  return timingSafeEqualHex(actual, expectedHashHex);
}

export function newId(prefix) {
  const rand = bytesToHex(crypto.getRandomValues(new Uint8Array(9)));
  return `${prefix}_${rand}`;
}

export function newSessionToken() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function isoNow() {
  return new Date().toISOString();
}

export function isoInDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// --- Session + capability resolution ---

export function capabilitiesFor(role) {
  const elevated = role === 'vip' || role === 'admin';
  return {
    admin: role === 'admin',
    cloudWatchlist: elevated,
    premiumServers: elevated,
    adsFree: elevated,
  };
}

export async function createSession(env, userId) {
  const token = newSessionToken();
  const now = isoNow();
  await tursoExec(env, [
    {
      sql: 'INSERT INTO oasis_movies_sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [newId('ses'), userId, token, isoInDays(SESSION_TTL_DAYS), now],
    },
  ]);
  return token;
}

// Resolve the caller from `Authorization: Bearer <token>`.
// Returns { id, email, role, capabilities } or null.
export async function getSessionUser(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return null;

  const rows = await tursoQuery(
    env,
    `SELECT u.id, u.email, u.role, s.expires_at, s.id AS session_id
     FROM oasis_movies_sessions s
     JOIN oasis_movies_users u ON u.id = s.user_id
     WHERE s.token = ?`,
    [token]
  );
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  return {
    id: row.id,
    email: row.email,
    role: row.role,
    sessionId: row.session_id,
    capabilities: capabilitiesFor(row.role),
  };
}

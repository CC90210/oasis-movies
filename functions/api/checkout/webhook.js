// POST /api/checkout/webhook — Stripe webhook receiver.
// On checkout.session.completed: promote the user to VIP and record the
// subscription. Dormant until CHECKOUT_ENABLED + STRIPE_WEBHOOK_SECRET are
// configured — see create-session.js header.

import { json, newId, isoNow } from '../../lib/auth.js';
import { tursoExec } from '../../lib/turso.js';

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifyStripeSignature(payload, header, secret) {
  // Stripe-Signature: t=<unix>,v1=<hmac_sha256 hex>
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false; // 5 min tolerance

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parts.t}.${payload}`));
  const expected = new Uint8Array(sig);
  return timingSafeEqual(expected, hexToBytes(parts.v1));
}

export async function onRequestPost({ request, env }) {
  if (env.CHECKOUT_ENABLED !== 'true' || !env.STRIPE_WEBHOOK_SECRET) {
    return json({ error: 'checkout_not_enabled' }, 503);
  }

  const payload = await request.text();
  const sigHeader = request.headers.get('Stripe-Signature') || '';
  if (!(await verifyStripeSignature(payload, sigHeader, env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: 'invalid_signature' }, 400);
  }

  const event = JSON.parse(payload);
  if (event.type !== 'checkout.session.completed') {
    return json({ ok: true, ignored: event.type });
  }

  const session = event.data.object;
  const userId = session.metadata?.user_id;
  const tier = session.metadata?.tier;
  if (!userId || !['vip_monthly', 'vip_annual'].includes(tier)) {
    return json({ error: 'missing_metadata' }, 400);
  }

  const now = isoNow();
  await tursoExec(env, [
    {
      sql: "UPDATE oasis_movies_users SET role = 'vip', updated_at = ? WHERE id = ? AND role != 'admin'",
      args: [now, userId],
    },
    {
      sql: `INSERT INTO oasis_movies_subscriptions (id, user_id, tier, provider, external_id, status, created_at)
            VALUES (?, ?, ?, 'stripe', ?, 'active', ?)`,
      args: [newId('sub'), userId, tier, session.subscription || session.id, now],
    },
  ]);

  return json({ ok: true, upgraded: userId, tier });
}

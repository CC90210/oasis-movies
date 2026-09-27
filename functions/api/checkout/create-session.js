// POST /api/checkout/create-session — begin a VIP checkout.
//
// DORMANT BY DESIGN: returns 503 unless the operator deliberately sets
//   CHECKOUT_ENABLED = "true"
//   STRIPE_SECRET_KEY = sk_...
// on the Pages project. Do not activate this against unlicensed content —
// wire it up only after the catalog moves to licensed / public-domain sources.

import { json, getSessionUser } from '../../lib/auth.js';

const PRICES = {
  vip_monthly: { amount: '499', interval: 'month', label: 'Oasis VIP Monthly' },
  vip_annual: { amount: '3900', interval: 'year', label: 'Oasis VIP Annual' },
};

export async function onRequestPost({ request, env }) {
  if (env.CHECKOUT_ENABLED !== 'true' || !env.STRIPE_SECRET_KEY) {
    return json({ error: 'checkout_not_enabled' }, 503);
  }

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const tier = PRICES[String(body.tier || '')];
  if (!tier) return json({ error: 'invalid_tier' }, 400);

  const origin = new URL(request.url).origin;
  const params = new URLSearchParams({
    mode: 'subscription',
    customer_email: user.email,
    success_url: `${origin}/#/pricing?checkout=success`,
    cancel_url: `${origin}/#/pricing?checkout=cancelled`,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': tier.amount,
    'line_items[0][price_data][recurring][interval]': tier.interval,
    'line_items[0][price_data][product_data][name]': tier.label,
    'line_items[0][quantity]': '1',
    'metadata[user_id]': user.id,
    'metadata[tier]': String(body.tier),
  });

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const session = await res.json();
  if (!res.ok) {
    return json({ error: 'stripe_error', detail: session.error?.message || 'unknown' }, 502);
  }
  return json({ checkout_url: session.url });
}

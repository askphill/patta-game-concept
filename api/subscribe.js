import { redis } from '../lib/redis.js';
import { validateOrigin } from '../lib/origin.js';
import { subscribeToKlaviyo, resolveCountryName } from '../lib/klaviyo.js';
import { waitUntil } from '@vercel/functions';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!validateOrigin(req, res)) return;

  const GENERIC_ERROR = 'Subscription failed. Please try again.';
  const { firstName, email, turnstileToken } = req.body || {};

  // 1. Verify Turnstile token
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const turnstileError = await verifyTurnstile(turnstileToken, clientIp);
  if (turnstileError) {
    const emailRaw = typeof email === 'string' ? email.toLowerCase().trim() : '';
    const firstNameRaw = typeof firstName === 'string' ? firstName.trim() : '';
    const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw);
    console.log('[REJECT] subscribe turnstile', turnstileError, JSON.stringify({
      klaviyo: hasValidEmail ? 'queued' : 'skipped',
      email: emailRaw || null,
    }));
    if (hasValidEmail) {
      const isoCountry = req.headers['x-vercel-ip-country'] || null;
      waitUntil(
        subscribeToKlaviyo(emailRaw, { firstName: firstNameRaw, country: resolveCountryName(isoCountry) })
          .catch((err) => console.error('[KLAVIYO] subscribe turnstile-reject error', err))
      );
    }
    return res.status(403).json({ error: GENERIC_ERROR });
  }

  // 2. Validate inputs (user-facing)
  const inputError = validateInputs(firstName, email);
  if (inputError) {
    return res.status(400).json({ error: inputError });
  }

  const cleanFirstName = firstName
    .trim()
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
  const emailLower = email.toLowerCase().trim();

  // 3. Rate limit (per email + per IP, 1-hour window)
  const rlPipe = redis.pipeline();
  rlPipe.incr(`ratelimit:subscribe:email:${emailLower}`);
  rlPipe.expire(`ratelimit:subscribe:email:${emailLower}`, 3600);
  rlPipe.incr(`ratelimit:subscribe:ip:${clientIp}`);
  rlPipe.expire(`ratelimit:subscribe:ip:${clientIp}`, 3600);
  const [emailCount, , ipCount] = await rlPipe.exec();

  if (emailCount > 5 || ipCount > 50) {
    return res.status(429).json({ error: GENERIC_ERROR });
  }

  // 4. Klaviyo — deferred so the response returns immediately
  const isoCountry = req.headers['x-vercel-ip-country'] || null;
  const country = resolveCountryName(isoCountry);
  console.log('[KLAVIYO] subscribe start', { email: emailLower, firstName: cleanFirstName, country });
  waitUntil(
    subscribeToKlaviyo(emailLower, { firstName: cleanFirstName, country })
      .catch((err) => console.error('[KLAVIYO] subscribe error', err))
  );

  return res.status(200).json({ ok: true });
}

async function verifyTurnstile(token, ip) {
  if (!token) return 'Missing Turnstile token';

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: process.env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: ip,
    }),
  });
  const data = await res.json();
  if (!data.success) return 'Bot verification failed';
  return null;
}

function validateInputs(firstName, email) {
  if (!firstName || typeof firstName !== 'string') return 'First name is required';
  const trimmed = firstName.trim();
  if (trimmed.length === 0 || trimmed.length > 32) return 'First name must be 1-32 characters';
  if (!/^[a-zA-Z][a-zA-Z .'-]*$/.test(trimmed)) return 'First name contains invalid characters';

  if (!email || typeof email !== 'string') return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Invalid email address';

  return null;
}

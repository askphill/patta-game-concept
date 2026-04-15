import { redis } from '../lib/redis.js';
import { getTopTen } from '../lib/leaderboard.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, score, sessionId, turnstileToken } = req.body;

  const clientIpForTurnstile = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();

  // 1. Verify Turnstile token (before session, so session isn't consumed on failure)
  const turnstileError = await verifyTurnstile(turnstileToken, clientIpForTurnstile);
  if (turnstileError) {
    return res.status(403).json({ error: turnstileError });
  }

  // 2. Validate inputs
  const inputError = validateInputs(name, email, score);
  if (inputError) {
    return res.status(400).json({ error: inputError });
  }

  // 3. Validate session (atomic delete prevents reuse)
  const sessionError = await validateSession(sessionId, score);
  if (sessionError) {
    return res.status(403).json({ error: sessionError });
  }

  const emailLower = email.toLowerCase().trim();
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  // 4. Rate limit (per email + per IP)
  const rateLimitError = await checkRateLimit(emailLower, clientIp);
  if (rateLimitError) {
    return res.status(429).json({ error: rateLimitError });
  }

  // 5. Write score (GT = only update if new score is higher)
  await redis.zadd('leaderboard', { gt: true }, { score, member: emailLower });

  // 6. Store/update player data
  await redis.hset(`player:${emailLower}`, { name: name.trim(), email: emailLower, score });

  // 7. Klaviyo call (fire-and-forget, don't block response)
  const klaviyoPromise = subscribeToKlaviyo(emailLower, name.trim(), score).catch((err) => {
    console.error('[Klaviyo] Error:', err.message || err);
  });

  // 8. Get fresh leaderboard + user rank
  const [topTen, userRank] = await Promise.all([
    getTopTen(),
    redis.zrevrank('leaderboard', emailLower),
  ]);

  const rank = userRank !== null ? userRank + 1 : null;

  // 9. Return response
  // Send response immediately, let Klaviyo finish in background
  res.status(200).json({
    rank,
    topTen,
    userEntry: { rank, name: name.trim(), score },
  });

  // Wait for Klaviyo to finish before function terminates
  await klaviyoPromise;
}

async function validateSession(sessionId, score) {
  if (!sessionId) return 'Missing session ID';

  // Atomic get-and-delete: prevents race condition where two requests use the same session
  const session = await redis.getdel(`session:${sessionId}`);
  if (!session) return 'Invalid or expired session';

  const elapsed = (Date.now() - session.startTime) / 1000;
  if (elapsed < 5) return 'Score submitted too quickly';

  // Plausibility: each kick cycle takes ~1 second minimum
  if (score > elapsed * 1.5) return 'Score not plausible for session duration';

  return null;
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

function validateInputs(name, email, score) {
  if (!name || typeof name !== 'string') return 'Name is required';
  if (name.trim().length === 0 || name.trim().length > 16) return 'Name must be 1-16 characters';
  if (!/^[a-zA-Z0-9_@. -]+$/.test(name.trim())) return 'Name contains invalid characters';
  if (/https?:|www\.|\.com|\.net|\.org|\.io/i.test(name)) return 'URLs not allowed in name';

  if (!email || typeof email !== 'string') return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Invalid email format';

  if (!Number.isInteger(score) || score < 1 || score > 500) return 'Invalid score';

  return null;
}

async function checkRateLimit(email, ip) {
  const emailKey = `ratelimit:email:${email}`;
  const ipKey = `ratelimit:ip:${ip}`;

  // Use pipeline for atomic incr + expire
  const pipeline = redis.pipeline();
  pipeline.incr(emailKey);
  pipeline.expire(emailKey, 3600);
  pipeline.incr(ipKey);
  pipeline.expire(ipKey, 3600);
  const results = await pipeline.exec();

  const emailCount = results[0];
  const ipCount = results[2];

  if (emailCount > 10) return 'Too many submissions. Try again later.';
  if (ipCount > 100) return 'Too many submissions from this network. Try again later.';
  return null;
}

async function subscribeToKlaviyo(email, name, score) {
  const apiKey = process.env.KLAVIYO_API_KEY;
  const listId = process.env.KLAVIYO_LIST_ID;
  if (!apiKey || !listId) {
    console.log('[Klaviyo] Missing env vars — apiKey:', !!apiKey, 'listId:', !!listId);
    return;
  }

  const res = await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/', {
    method: 'POST',
    headers: {
      'Authorization': `Klaviyo-API-Key ${apiKey}`,
      'Content-Type': 'application/json',
      'revision': '2024-10-15',
    },
    body: JSON.stringify({
      data: {
        type: 'profile-subscription-bulk-create-job',
        attributes: {
          profiles: {
            data: [{
              type: 'profile',
              attributes: {
                email,
                subscriptions: {
                  email: {
                    marketing: {
                      consent: 'SUBSCRIBED',
                    },
                  },
                },
              },
            }],
          },
          historical_import: false,
        },
        relationships: {
          list: {
            data: { type: 'list', id: listId },
          },
        },
      },
    }),
  });

  const body = await res.text();
  console.log('[Klaviyo] Subscribe status:', res.status, 'Response:', body);

  // Update profile with custom properties (separate API call)
  const profileRes = await fetch('https://a.klaviyo.com/api/profile-import/', {
    method: 'POST',
    headers: {
      'Authorization': `Klaviyo-API-Key ${apiKey}`,
      'Content-Type': 'application/json',
      'revision': '2024-10-15',
    },
    body: JSON.stringify({
      data: {
        type: 'profile',
        attributes: {
          email,
          properties: {
            patta_game_username: name,
            patta_game_score: score,
          },
        },
      },
    }),
  });

  const profileBody = await profileRes.text();
  console.log('[Klaviyo] Profile update status:', profileRes.status, 'Response:', profileBody);
}

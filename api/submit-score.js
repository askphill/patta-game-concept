import { redis } from '../lib/redis.js';
import { getTopTen } from '../lib/leaderboard.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, score, sessionId, turnstileToken } = req.body;

  // 1. Validate session
  const sessionError = await validateSession(sessionId);
  if (sessionError) {
    return res.status(403).json({ error: sessionError });
  }

  // 2. Verify Turnstile token
  const turnstileError = await verifyTurnstile(turnstileToken);
  if (turnstileError) {
    return res.status(403).json({ error: turnstileError });
  }

  // 3. Validate inputs
  const inputError = validateInputs(name, email, score);
  if (inputError) {
    return res.status(400).json({ error: inputError });
  }

  const emailLower = email.toLowerCase().trim();

  // 4. Rate limit (10 per email per hour)
  const rateLimitError = await checkRateLimit(emailLower);
  if (rateLimitError) {
    return res.status(429).json({ error: rateLimitError });
  }

  // 5. Write score (GT = only update if new score is higher)
  await redis.zadd('leaderboard', { gt: true }, { score, member: emailLower });

  // 6. Store/update player data
  await redis.hset(`player:${emailLower}`, { name: name.trim(), email: emailLower, score });

  // 7. Fire-and-forget Klaviyo call
  subscribeToKlaviyo(emailLower, name.trim(), score).catch(() => {});

  // 8. Get fresh leaderboard + user rank
  const [topTen, userRank] = await Promise.all([
    getTopTen(),
    redis.zrevrank('leaderboard', emailLower),
  ]);

  const rank = userRank !== null ? userRank + 1 : null;

  // 9. Return response
  return res.status(200).json({
    rank,
    topTen,
    userEntry: { rank, name: name.trim(), score },
  });
}

async function validateSession(sessionId) {
  if (!sessionId) return 'Missing session ID';

  const session = await redis.get(`session:${sessionId}`);
  if (!session) return 'Invalid or expired session';
  if (session.used) return 'Session already used';
  if (Date.now() - session.startTime < 5000) return 'Score submitted too quickly';

  // Mark session as used
  await redis.set(`session:${sessionId}`, { ...session, used: true }, { ex: 600 });
  return null;
}

async function verifyTurnstile(token) {
  if (!token) return 'Missing Turnstile token';

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: process.env.TURNSTILE_SECRET_KEY,
      response: token,
    }),
  });
  const data = await res.json();

  if (!data.success) return 'Bot verification failed';
  return null;
}

function validateInputs(name, email, score) {
  if (!name || typeof name !== 'string') return 'Name is required';
  if (name.trim().length === 0 || name.trim().length > 16) return 'Name must be 1-16 characters';
  if (!/^[a-zA-Z0-9_ -]+$/.test(name.trim())) return 'Name contains invalid characters';
  if (/https?:|www\.|\.com|\.net|\.org|\.io/i.test(name)) return 'URLs not allowed in name';

  if (!email || typeof email !== 'string') return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Invalid email format';

  if (!Number.isInteger(score) || score < 1) return 'Invalid score';

  return null;
}

async function checkRateLimit(email) {
  const key = `ratelimit:${email}`;
  const count = await redis.incr(key);

  // Set TTL on first increment
  if (count === 1) {
    await redis.expire(key, 3600);
  }

  if (count > 10) return 'Too many submissions. Try again later.';
  return null;
}

async function subscribeToKlaviyo(email, name, score) {
  const apiKey = process.env.KLAVIYO_API_KEY;
  const listId = process.env.KLAVIYO_LIST_ID;
  if (!apiKey || !listId) return;

  await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/', {
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
                properties: {
                  patta_game_username: name,
                  patta_game_score: score,
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
}

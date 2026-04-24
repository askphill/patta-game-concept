import { redis } from '../lib/redis.js';
import {
  rebuildAndCacheTopTen,
  parseCachedTopTen,
  TOP_TEN_CACHE_KEY,
} from '../lib/leaderboard.js';
import { containsProfanity } from '../lib/profanity.js';
import { validateOrigin } from '../lib/origin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!validateOrigin(req, res)) return;

  const GENERIC_ERROR = 'Submission failed. Please try again.';
  const { name, email, _v: score, _b: baseScore, _s: sig, sessionId, turnstileToken } = req.body;

  // Verify payload signature
  if (!verifySignature(name, email, score, sessionId, sig)) {
    console.log('[REJECT] signature', { name, score, sessionId, sig });
    return res.status(403).json({ error: GENERIC_ERROR });
  }

  const clientIpForTurnstile = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();

  // 1. Verify Turnstile token
  const turnstileError = await verifyTurnstile(turnstileToken, clientIpForTurnstile);
  if (turnstileError) {
    console.log('[REJECT] turnstile', turnstileError);
    return res.status(403).json({ error: GENERIC_ERROR });
  }

  // 2. Validate inputs (user-facing errors for fixable issues)
  const inputError = validateInputs(name, email, score, baseScore);
  if (inputError) {
    console.log('[REJECT] input', inputError);
    return res.status(400).json({ error: inputError });
  }

  // 3. Check profanity (user-facing, specific message)
  if (containsProfanity(name)) {
    return res.status(400).json({ error: 'Username not allowed, Patta got love for all' });
  }

  // 4. Check username uniqueness (case-insensitive) before consuming the session
  const emailLower = email.toLowerCase().trim();
  const nameLower = name.trim().toLowerCase();
  const usernameOwner = await redis.get(`username:${nameLower}`);
  if (usernameOwner && usernameOwner !== emailLower) {
    return res.status(400).json({ error: 'Username already taken' });
  }

  if (!sessionId) {
    console.log('[REJECT] session', 'Missing session ID');
    return res.status(403).json({ error: GENERIC_ERROR });
  }

  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  // 5. Consume session + bump rate limits in one round-trip
  const gatePipe = redis.pipeline();
  gatePipe.getdel(`session:${sessionId}`);
  gatePipe.incr(`ratelimit:email:${emailLower}`);
  gatePipe.expire(`ratelimit:email:${emailLower}`, 3600);
  gatePipe.incr(`ratelimit:ip:${clientIp}`);
  gatePipe.expire(`ratelimit:ip:${clientIp}`, 3600);
  const [session, emailCount, , ipCount] = await gatePipe.exec();

  if (emailCount > 10 || ipCount > 100) {
    return res.status(429).json({ error: GENERIC_ERROR });
  }
  const sessionError = validateSession(session, baseScore || score);
  if (sessionError) {
    console.log('[REJECT] session', sessionError);
    return res.status(403).json({ error: GENERIC_ERROR });
  }

  // 6. Persist score, player data, and username claim in one round-trip
  const writePipe = redis.pipeline();
  writePipe.zadd('leaderboard', { gt: true }, { score, member: emailLower });
  writePipe.hset(`player:${emailLower}`, { name: name.trim(), email: emailLower, score });
  writePipe.set(`username:${nameLower}`, emailLower);
  await writePipe.exec();

  // 7. Klaviyo call (awaited — simpler + reliable across local + prod)
  const isoCountry = req.headers['x-vercel-ip-country'] || null;
  const country = resolveCountryName(isoCountry);
  console.log('[KLAVIYO] start', { email: emailLower, name: name.trim(), score, isoCountry, country });
  try {
    await subscribeToKlaviyo(emailLower, name.trim(), score, country);
  } catch (err) {
    console.error('[KLAVIYO] unexpected error', err);
  }

  // 8. Fetch rank + cached top 10 together; rebuild only if user landed in top 10
  const readPipe = redis.pipeline();
  readPipe.zrevrank('leaderboard', emailLower);
  readPipe.get(TOP_TEN_CACHE_KEY);
  const [userRank, cachedRaw] = await readPipe.exec();
  const rank = userRank !== null ? userRank + 1 : null;

  const cachedTopTen = parseCachedTopTen(cachedRaw);
  const topTen = rank !== null && rank <= 10
    ? await rebuildAndCacheTopTen()
    : cachedTopTen ?? await rebuildAndCacheTopTen();

  // 9. Return response
  res.status(200).json({
    rank,
    topTen,
    userEntry: { rank, name: name.trim(), score },
  });
}

function validateSession(session, score) {
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

function verifySignature(name, email, score, sessionId, sig) {
  if (!sig || !sessionId || score === undefined) return false;
  var key = sessionId + ':' + score + ':' + name.length;
  var hash = 0;
  for (var i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return hash.toString(36) === sig;
}

function validateInputs(name, email, score, baseScore) {
  if (!name || typeof name !== 'string') return 'Name is required';
  if (name.trim().length === 0 || name.trim().length > 16) return 'Name must be 1-16 characters';
  if (!/^[a-zA-Z0-9_@. -]+$/.test(name.trim())) return 'Name contains invalid characters';
  if (/https?:|www\.|\.com|\.net|\.org|\.io/i.test(name)) return 'URLs not allowed in name';

  if (!email || typeof email !== 'string') return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Invalid email format';

  if (!Number.isInteger(score) || score < 1 || score > 2000) return 'Invalid score';

  // Bonus can't exceed baseScore * 3 (sweet spot streaks + logo bonuses)
  if (baseScore && score - baseScore > baseScore * 3) return 'Invalid score';

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

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

function resolveCountryName(isoCode) {
  if (!isoCode) return null;
  try {
    return regionNames.of(isoCode) || null;
  } catch {
    return null;
  }
}

async function subscribeToKlaviyo(email, name, score, country) {
  const apiKey = process.env.KLAVIYO_API_KEY;
  const listId = process.env.KLAVIYO_LIST_ID;
  if (!apiKey || !listId) {
    console.warn('[KLAVIYO] skipped — missing env', { hasApiKey: !!apiKey, hasListId: !!listId });
    return;
  }

  const subRes = await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/', {
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

  const subBody = await subRes.text();
  if (!subRes.ok) {
    console.error('[KLAVIYO] subscription failed', { status: subRes.status, body: subBody });
  } else {
    console.log('[KLAVIYO] subscription ok', { status: subRes.status, email, listId });
  }

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
          ...(country && { location: { country } }),
          properties: {
            patta_game_username: name,
            patta_game_score: score,
          },
        },
      },
    }),
  });

  const profileBody = await profileRes.text();
  if (!profileRes.ok) {
    console.error('[KLAVIYO] profile-import failed', { status: profileRes.status, body: profileBody });
  } else {
    console.log('[KLAVIYO] profile-import ok', { status: profileRes.status, email, country });
  }
}

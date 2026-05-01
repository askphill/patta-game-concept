import { redis } from '../lib/redis.js';
import {
  rebuildAndCacheTopTen,
  parseCachedTopTen,
  TOP_TEN_CACHE_KEY,
} from '../lib/leaderboard.js';
import { containsProfanity } from '../lib/profanity.js';
import { validateOrigin } from '../lib/origin.js';
import { subscribeToKlaviyo, resolveCountryName } from '../lib/klaviyo.js';
import { waitUntil } from '@vercel/functions';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!validateOrigin(req, res)) return;

  const GENERIC_ERROR = 'Submission failed. Please try again.';
  const { n: name, e: email, _s: encoded, sid: sessionId, t: turnstileToken } = req.body;

  const clientIpForTurnstile = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();

  // 1. Verify Turnstile token
  const turnstileError = await verifyTurnstile(turnstileToken, clientIpForTurnstile);
  if (turnstileError) {
    const emailRaw = typeof email === 'string' ? email.toLowerCase().trim() : '';
    const nameRaw = typeof name === 'string' ? name.trim() : '';
    const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw);
    console.log('[REJECT] turnstile', turnstileError, JSON.stringify({
      klaviyo: hasValidEmail ? 'queued' : 'skipped',
      email: emailRaw || null,
    }));
    if (hasValidEmail) {
      const isoCountry = req.headers['x-vercel-ip-country'] || null;
      waitUntil(
        subscribeToKlaviyo(emailRaw, { username: nameRaw, country: resolveCountryName(isoCountry) })
          .catch((err) => console.error('[KLAVIYO] turnstile-reject error', err))
      );
    }
    return res.status(403).json({ error: GENERIC_ERROR });
  }

  // 2. Validate name + email (score comes after session decode)
  const identityError = validateIdentity(name, email);
  if (identityError) {
    return res.status(400).json({ error: identityError });
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

  if (!sessionId || !encoded) {
    console.log('[REJECT] session', 'Missing session ID or payload');
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

  if (emailCount > 60 || ipCount > 100) {
    console.log('[submit-score 429]', JSON.stringify({
      email: emailLower,
      emailCount,
      ip: clientIp,
      ipCount,
      ua: req.headers['user-agent'] || null,
      origin: req.headers['origin'] || null,
      referer: req.headers['referer'] || null,
    }));
    return res.status(429).json({ error: GENERIC_ERROR });
  }

  // 6. Decode scores using the session secret
  if (!session || !session.secret) {
    console.log('[REJECT] session', 'Invalid or expired session');
    return res.status(403).json({ error: GENERIC_ERROR });
  }
  const decoded = decodeScores(encoded, session.secret);
  if (!decoded) {
    console.log('[REJECT] decode', 'Invalid payload encoding');
    return res.status(403).json({ error: GENERIC_ERROR });
  }
  const { score, baseScore } = decoded;

  // 7. Validate decoded score values
  const scoreError = validateScores(score, baseScore);
  if (scoreError) {
    console.log('[REJECT] input', JSON.stringify({
      error: scoreError,
      score,
      baseScore,
      name: name?.trim(),
      email: emailLower,
      ip: clientIp,
      ua: req.headers['user-agent'] || null,
    }));
    return res.status(400).json({ error: scoreError });
  }

  const sessionCheck = validateSession(session, baseScore || score);
  if (sessionCheck.error) {
    console.log('[REJECT] session', sessionCheck.error);
    return res.status(403).json({ error: GENERIC_ERROR });
  }
  const elapsedSeconds = sessionCheck.elapsed;

  // 8. Persist score, player data, and username claim in one round-trip.
  // baseScore + elapsedSeconds are stored for forensic auditing of suspicious
  // top scores; they don't affect the leaderboard ranking.
  const writePipe = redis.pipeline();
  writePipe.zadd('leaderboard', { gt: true }, { score, member: emailLower });
  writePipe.hset(`player:${emailLower}`, {
    name: name.trim(),
    email: emailLower,
    score,
    baseScore: baseScore ?? null,
    elapsedSeconds: Math.round(elapsedSeconds),
  });
  writePipe.set(`username:${nameLower}`, emailLower);
  await writePipe.exec();

  console.log('[ACCEPTED]', JSON.stringify({
    email: emailLower,
    name: name.trim(),
    score,
    baseScore: baseScore ?? null,
    elapsedSeconds: Math.round(elapsedSeconds),
    bonusRatio: baseScore ? +((score - baseScore) / baseScore).toFixed(2) : null,
  }));

  // 7. Klaviyo call — deferred via waitUntil so the response returns immediately
  const isoCountry = req.headers['x-vercel-ip-country'] || null;
  const country = resolveCountryName(isoCountry);
  console.log('[KLAVIYO] start', { email: emailLower, name: name.trim(), score, isoCountry, country });
  waitUntil(
    subscribeToKlaviyo(emailLower, { username: name.trim(), score, country })
      .catch((err) => console.error('[KLAVIYO] unexpected error', err))
  );

  // 9. Fetch rank, cached top 10, and actual stored score in one round-trip
  const readPipe = redis.pipeline();
  readPipe.zrevrank('leaderboard', emailLower);
  readPipe.get(TOP_TEN_CACHE_KEY);
  readPipe.zscore('leaderboard', emailLower);
  const [userRank, cachedRaw, storedScore] = await readPipe.exec();
  const rank = userRank !== null ? userRank + 1 : null;
  const bestScore = storedScore !== null ? Number(storedScore) : score;

  const cachedTopTen = parseCachedTopTen(cachedRaw);
  const topTen = rank !== null && rank <= 10
    ? await rebuildAndCacheTopTen()
    : cachedTopTen ?? await rebuildAndCacheTopTen();

  // 10. Return response
  res.status(200).json({
    rank,
    topTen,
    userEntry: { rank, name: name.trim(), score: bestScore },
  });
}

function validateSession(session, score) {
  if (!session) return { error: 'Invalid or expired session' };
  const elapsed = (Date.now() - session.startTime) / 1000;
  if (elapsed < 5) return { error: 'Score submitted too quickly', elapsed };
  // Plausibility: each kick cycle takes ~1 second minimum
  if (score > elapsed * 1.5) return { error: 'Score not plausible for session duration', elapsed };
  return { error: null, elapsed };
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

function validateIdentity(name, email) {
  if (!name || typeof name !== 'string') return 'Name is required';
  if (name.trim().length === 0 || name.trim().length > 16) return 'Name must be 1-16 characters';
  if (!/^[a-zA-Z0-9_@. -]+$/.test(name.trim())) return 'Name contains invalid characters';
  if (/https?:|www\.|\.com|\.net|\.org|\.io/i.test(name)) return 'URLs not allowed in name';

  if (!email || typeof email !== 'string') return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Invalid email format';

  return null;
}

function validateScores(score, baseScore) {
  if (!Number.isInteger(score) || score < 1 || score > 2000) return 'Invalid score';

  // Sweet-streak bonuses scale quadratically (n in a row = n(n+1)/2). Combined
  // with logo bonuses (~40pts by kick 91), a 34-kick streak reaches ~7× baseScore.
  // Session plausibility check is the tighter bound.
  if (baseScore && score - baseScore > baseScore * 7) return 'Invalid score';

  return null;
}

function decodeScores(encoded, secret) {
  if (typeof encoded !== 'string' || encoded.length !== 16) return null;
  try {
    const buf = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      buf[i] = parseInt(encoded.slice(i * 2, i * 2 + 2), 16) ^
               parseInt(secret.slice(i * 2, i * 2 + 2), 16);
    }
    const score    = (buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3];
    const baseScore = (buf[4] << 24) | (buf[5] << 16) | (buf[6] << 8) | buf[7];
    return { score: score >>> 0, baseScore: baseScore >>> 0 };
  } catch {
    return null;
  }
}

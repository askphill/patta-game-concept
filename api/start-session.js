import { redis } from '../lib/redis.js';
import { randomUUID } from 'crypto';
import { validateOrigin } from '../lib/origin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!validateOrigin(req, res)) return;

  // IP-based rate limit: max 60 sessions per IP per hour
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const rateLimitKey = `ratelimit:session:${ip}`;
  const pipeline = redis.pipeline();
  pipeline.incr(rateLimitKey);
  pipeline.expire(rateLimitKey, 3600);
  const results = await pipeline.exec();
  const count = results[0];

  if (count > 200) {
    console.log('[start-session 429]', JSON.stringify({
      ip,
      count,
      ua: req.headers['user-agent'] || null,
      origin: req.headers['origin'] || null,
      referer: req.headers['referer'] || null,
    }));
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const sessionId = randomUUID();

  await redis.set(`session:${sessionId}`, {
    startTime: Date.now(),
  }, { ex: 600 }); // 10-minute TTL

  return res.status(200).json({ sessionId });
}

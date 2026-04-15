import { redis } from '../lib/redis.js';
import { randomUUID } from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // IP-based rate limit: max 60 sessions per IP per hour
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const rateLimitKey = `ratelimit:session:${ip}`;
  const pipeline = redis.pipeline();
  pipeline.incr(rateLimitKey);
  pipeline.expire(rateLimitKey, 3600);
  const results = await pipeline.exec();
  const count = results[0];

  if (count > 200) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const sessionId = randomUUID();

  await redis.set(`session:${sessionId}`, {
    startTime: Date.now(),
  }, { ex: 600 }); // 10-minute TTL

  return res.status(200).json({ sessionId });
}

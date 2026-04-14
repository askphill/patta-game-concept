import { redis } from '../lib/redis.js';
import { randomUUID } from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = randomUUID();

  await redis.set(`session:${sessionId}`, {
    startTime: Date.now(),
    used: false,
  }, { ex: 600 }); // 10-minute TTL

  return res.status(200).json({ sessionId });
}

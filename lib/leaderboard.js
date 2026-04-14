import { redis } from './redis.js';

/**
 * Fetches the top N entries from the leaderboard sorted set.
 * Returns an array of { rank, name, score } objects.
 */
export async function getTopTen(count = 10) {
  // Get top emails from the sorted set (highest scores first)
  const emails = await redis.zrange('leaderboard', 0, count - 1, { rev: true });

  if (!emails || emails.length === 0) {
    return [];
  }

  // Fetch scores and player names in a pipeline
  const pipeline = redis.pipeline();
  for (const email of emails) {
    pipeline.zscore('leaderboard', email);
    pipeline.hget(`player:${email}`, 'name');
  }
  const results = await pipeline.exec();

  const entries = [];
  for (let i = 0; i < emails.length; i++) {
    const score = results[i * 2];
    const name = results[i * 2 + 1];
    entries.push({
      rank: i + 1,
      name: name || 'Anonymous',
      score: Number(score),
    });
  }

  return entries;
}

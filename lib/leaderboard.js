import { redis } from './redis.js';

export const TOP_TEN_CACHE_KEY = 'leaderboard:top10_cache';
const TOP_TEN_CACHE_TTL = 3600;

export function parseCachedTopTen(cached) {
  if (!cached) return null;
  return typeof cached === 'string' ? JSON.parse(cached) : cached;
}

async function fetchTopTenFromRedis(count = 10) {
  const withScores = await redis.zrange('leaderboard', 0, count - 1, {
    rev: true,
    withScores: true,
  });

  if (!withScores || withScores.length === 0) {
    return [];
  }

  const emails = [];
  const scores = [];
  for (let i = 0; i < withScores.length; i += 2) {
    emails.push(withScores[i]);
    scores.push(Number(withScores[i + 1]));
  }

  const pipeline = redis.pipeline();
  for (const email of emails) {
    pipeline.hget(`player:${email}`, 'name');
  }
  const names = await pipeline.exec();

  return emails.map((email, i) => ({
    rank: i + 1,
    name: names[i] || 'Anonymous',
    score: scores[i],
  }));
}

export async function rebuildAndCacheTopTen(count = 10) {
  const entries = await fetchTopTenFromRedis(count);
  await redis.set(TOP_TEN_CACHE_KEY, JSON.stringify(entries), { ex: TOP_TEN_CACHE_TTL });
  return entries;
}

export async function getCachedTopTen(count = 10) {
  const cached = await redis.get(TOP_TEN_CACHE_KEY);
  const parsed = parseCachedTopTen(cached);
  return parsed ?? rebuildAndCacheTopTen(count);
}

export const getTopTen = getCachedTopTen;

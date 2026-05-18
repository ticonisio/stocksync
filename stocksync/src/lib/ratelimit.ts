import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

function createRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = createRedis();
const MEMORY_LIMIT = 5;
const MEMORY_WINDOW_MS = 60_000;
const memoryHits = new Map<string, { count: number; resetAt: number }>();

export const authLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '60 s'),
      prefix: 'rl:auth',
    })
  : null;

function checkMemoryRateLimit(key: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const current = memoryHits.get(key);

  if (!current || current.resetAt <= now) {
    memoryHits.set(key, { count: 1, resetAt: now + MEMORY_WINDOW_MS });
    return { allowed: true };
  }

  if (current.count >= MEMORY_LIMIT) {
    return {
      allowed: false,
      retryAfter: Math.ceil((current.resetAt - now) / 1000),
    };
  }

  current.count += 1;
  memoryHits.set(key, current);
  return { allowed: true };
}

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  if (!authLimiter) {
    return checkMemoryRateLimit(ip);
  }

  const { success, reset } = await authLimiter.limit(ip);
  if (success) return { allowed: true };

  const retryAfter = Math.ceil((reset - Date.now()) / 1000);
  return { allowed: false, retryAfter };
}

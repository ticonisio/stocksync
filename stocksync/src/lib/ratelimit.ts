import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

function createRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = createRedis();

export const authLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '60 s'),
      prefix: 'rl:auth',
    })
  : null;

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  if (!authLimiter) {
    return { allowed: process.env.NODE_ENV !== 'production' };
  }

  const { success, reset } = await authLimiter.limit(ip);
  if (success) return { allowed: true };

  const retryAfter = Math.ceil((reset - Date.now()) / 1000);
  return { allowed: false, retryAfter };
}

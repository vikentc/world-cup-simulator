import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL;
let client: ReturnType<typeof createClient> | null = null;
let isRedisReady = false;

const localCache = new Map<string, string>();

export async function initCache() {
  if (!redisUrl) {
    console.warn('⚠️ No REDIS_URL specified. Running with zero-config in-memory cache fallback.');
    return;
  }

  try {
    client = createClient({ url: redisUrl });
    client.on('error', (err) => {
      console.warn('Redis client error, falling back to local cache:', err.message);
      isRedisReady = false;
    });

    await client.connect();
    console.log('✅ Connected to Redis successfully.');
    isRedisReady = true;
  } catch (error) {
    console.error('❌ Failed to connect to Redis. Falling back to local cache.', error);
    isRedisReady = false;
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds = 3600): Promise<void> {
  if (isRedisReady && client) {
    try {
      await client.set(key, value, { EX: ttlSeconds });
      return;
    } catch (e) {
      console.error('Redis cacheSet error, using memory fallback:', e);
    }
  }
  localCache.set(key, value);
}

export async function cacheGet(key: string): Promise<string | null> {
  if (isRedisReady && client) {
    try {
      return await client.get(key);
    } catch (e) {
      console.error('Redis cacheGet error, using memory fallback:', e);
    }
  }
  return localCache.get(key) || null;
}

export async function cacheDel(key: string): Promise<void> {
  if (isRedisReady && client) {
    try {
      await client.del(key);
      return;
    } catch (e) {
      console.error('Redis cacheDel error, using memory fallback:', e);
    }
  }
  localCache.delete(key);
}

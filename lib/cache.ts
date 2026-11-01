import { createHash } from "node:crypto";

import { Redis } from "@upstash/redis";

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

interface CacheGlobal {
  lookDnaCache?: Map<string, CacheEntry>;
  lookDnaInFlight?: Map<string, Promise<unknown>>;
}

const cacheGlobal = globalThis as typeof globalThis & CacheGlobal;
const memoryCache = (cacheGlobal.lookDnaCache ??= new Map());
const inFlight = (cacheGlobal.lookDnaInFlight ??= new Map());

let redis: Redis | null | undefined;

export function createCacheKey(
  operation: string,
  imageHash: string,
  variant?: unknown,
): string {
  const variantHash = createHash("sha256")
    .update(JSON.stringify(variant ?? null))
    .digest("hex");

  const mode = process.env.MOCK_YOUCAM === "1" ? "mock" : "live";
  return `look-dna:v1:${mode}:${operation}:${imageHash}:${variantHash}`;
}

export async function getCached<T>(key: string): Promise<T | null> {
  const redisClient = getRedis();
  if (redisClient) {
    try {
      return (await redisClient.get<T>(key)) ?? null;
    } catch (error) {
      console.warn("Redis cache read failed; using memory cache.", error);
    }
  }

  const entry = memoryCache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }

  return entry.value as T;
}

export async function setCached<T>(
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  const redisClient = getRedis();
  if (redisClient) {
    try {
      await redisClient.set(key, value, { ex: ttlSeconds });
    } catch (error) {
      console.warn("Redis cache write failed; using memory cache.", error);
    }
  }

  memoryCache.set(key, {
    expiresAt: Date.now() + ttlSeconds * 1000,
    value,
  });
}

export async function getOrComputeCached<T>(
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T>,
): Promise<{ value: T; cached: boolean }> {
  const cached = await getCached<T>(key);
  if (cached !== null) {
    return { value: cached, cached: true };
  }

  const active = inFlight.get(key) as Promise<T> | undefined;
  if (active) {
    return { value: await active, cached: true };
  }

  const pending = (async () => {
    const secondCheck = await getCached<T>(key);
    if (secondCheck !== null) {
      return secondCheck;
    }

    const value = await producer();
    await setCached(key, value, ttlSeconds);
    return value;
  })();

  inFlight.set(key, pending);
  try {
    return { value: await pending, cached: false };
  } finally {
    inFlight.delete(key);
  }
}

export function clearMemoryCache(): void {
  memoryCache.clear();
}

export function getRedis(): Redis | null {
  if (redis !== undefined) {
    return redis;
  }

  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

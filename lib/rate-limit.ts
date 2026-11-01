import { AppError } from "@/lib/errors";
import { getRedis } from "@/lib/cache";

interface LimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitGlobal {
  lookDnaRateLimits?: Map<string, LimitEntry>;
}

const rateLimitGlobal = globalThis as typeof globalThis & RateLimitGlobal;
const memoryLimits = (rateLimitGlobal.lookDnaRateLimits ??= new Map());

export async function enforceRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  assertSameOrigin(request);

  const now = Date.now();
  const windowId = Math.floor(now / (windowSeconds * 1000));
  const key = `look-dna:rate:${scope}:${clientIp(request)}:${windowId}`;
  const redis = getRedis();

  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
      if (count > limit) {
        throw rateLimitError(windowSeconds);
      }
      return;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      console.warn("Redis rate limit failed; using memory limit.", error);
    }
  }

  const existing = memoryLimits.get(key);
  const entry =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + windowSeconds * 1000 };
  entry.count += 1;
  memoryLimits.set(key, entry);

  if (entry.count > limit) {
    throw rateLimitError(windowSeconds);
  }
}

function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    return;
  }

  if (new URL(origin).origin !== new URL(request.url).origin) {
    throw new AppError(
      "Cross-origin requests are not allowed.",
      403,
      "ORIGIN_NOT_ALLOWED",
    );
  }
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function rateLimitError(windowSeconds: number): AppError {
  return new AppError(
    `Too many requests. Try again in ${windowSeconds} seconds.`,
    429,
    "RATE_LIMITED",
  );
}

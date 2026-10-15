import { redisClient, isRedisAvailable } from "./redis.client";
import { logger } from "../../core/logger/logger";

export const CacheKeys = {
  offices: (archived = false) => `gms:offices:${archived}`,
  officeById: (id: number) => `gms:office:${id}`,
  departments: (officeId?: number, archived = false) =>
    `gms:depts:${officeId ?? "all"}:${archived}`,
  services: (officeId?: number, archived = false) =>
    `gms:svcs:${officeId ?? "all"}:${archived}`,
  dashboardStats: (officeId?: number) => `gms:dash:${officeId ?? "global"}`,
  hostLoad: (hostId: number) => `gms:host-load:${hostId}`,
  visitPolicy: () => "gms:visit-policy",
};

export const CACHE_TTL = {
  OFFICES: 300,
  DEPARTMENTS: 300,
  SERVICES: 300,
  DASHBOARD: 30,
  HOST_LOAD: 60,
  POLICY: 3600,
} as const;

export class CacheService {
  static async get<T>(key: string): Promise<T | null> {
    if (!isRedisAvailable() || !redisClient) return null;
    try {
      const raw = await redisClient.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  static async set(key: string, value: unknown, ttl: number): Promise<void> {
    if (!isRedisAvailable() || !redisClient) return;
    try {
      await redisClient.set(key, JSON.stringify(value), "EX", ttl);
    } catch (error) {
      logger.warn({ err: error, key }, "cache set failed");
    }
  }

  static async del(...keys: string[]): Promise<void> {
    if (!isRedisAvailable() || !redisClient || keys.length === 0) return;
    try {
      await redisClient.del(...keys);
    } catch {
      // Fail open.
    }
  }

  /**
   * Delete every key matching a pattern, without blocking the Redis server.
   *
   * This used `KEYS`, which walks the entire keyspace in a single operation and
   * blocks Redis for the whole traversal — Redis is single-threaded, so nothing
   * else runs meanwhile. That is not just this cache's problem: the same Redis
   * instance backs every BullMQ queue and the session-revocation cutoffs that
   * `auth.middleware` consults on every authenticated request. A cache
   * invalidation on a large keyspace stalls authentication for the whole
   * system, and it gets worse as the deployment gets busier — the shape of
   * outage that arrives without a code change.
   *
   * `SCAN` returns a cursor and a bounded batch, so the work is spread across
   * many short calls that interleave with everything else. It gives a weaker
   * guarantee (a key added mid-scan may be missed) and that is fine here: this
   * invalidates a cache, and a missed key expires on its own TTL.
   *
   * Deletes per batch rather than accumulating, so a large match set never
   * builds an unbounded array or a single enormous DEL.
   */
  static async delPattern(pattern: string): Promise<void> {
    if (!isRedisAvailable() || !redisClient) return;
    try {
      let cursor = '0';
      do {
        const [next, keys] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 250);
        cursor = next;
        if (keys.length > 0) await redisClient.del(...keys);
      } while (cursor !== '0');
    } catch {
      // Fail open.
    }
  }

  static async remember<T>(
    key: string,
    ttl: number,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;

    const fresh = await fetcher();
    await this.set(key, fresh, ttl);
    return fresh;
  }
}

/**
 * marketsCache.ts
 *
 * Cache key definitions and invalidation helpers for market data.
 *
 * Keys:
 *   markets:all     – serialised list of all active markets
 *   markets:{id}    – single market detail
 *
 * All cache operations are non-fatal: a Redis failure is logged but never
 * propagated to the caller so the API remains fully functional even when the
 * cache tier is unavailable.
 */

import { redisConnection } from "../queue";
import { logger } from "../config/logger";
import { getRequestId } from "../lib/requestContext";

// ── Key helpers ──────────────────────────────────────────────────────────────

/**
 * Canonical Redis key names for market cache entries.
 */
export const marketCacheKeys = {
  /** Key for the full list of all markets. */
  all: "markets:all" as const,

  /**
   * Key for a single market's detail record.
   * @param id - Market primary key
   */
  byId: (id: string): string => `markets:${id}`,
};

// ── Invalidation ─────────────────────────────────────────────────────────────

/**
 * Invalidates cache entries for a specific market and the all-markets list.
 *
 * Deletes both `markets:{id}` and `markets:all` in parallel so that any
 * in-flight read that follows will receive fresh data from the database.
 *
 * Errors are caught and logged; they do NOT throw so the calling business
 * operation is never blocked by a Redis outage.
 *
 * @param marketId - The market whose cache entry should be evicted
 */
export async function invalidateMarketCache(marketId: string): Promise<void> {
  const requestId = getRequestId();
  const keys = [marketCacheKeys.byId(marketId), marketCacheKeys.all];

  try {
    await Promise.all(keys.map((k) => redisConnection.del(k)));

    logger.info(
      { requestId, marketId, keys },
      "Market cache invalidated",
    );
  } catch (err) {
    logger.error(
      { requestId, marketId, err },
      "Failed to invalidate market cache",
    );
  }
}

// ── Full rebuild ──────────────────────────────────────────────────────────────

/**
 * Evicts all well-known hot-path cache keys so they are rebuilt on the next
 * read from the database.
 *
 * Currently hot paths:
 *   - markets:all
 *
 * The operation runs `DEL` for every key. Any key that was not cached is
 * silently skipped (DEL returns 0 for missing keys).
 *
 * Errors are caught and re-thrown so the caller (the admin endpoint) can
 * return an appropriate HTTP error response.
 *
 * @returns Metadata about the keys that were targeted for eviction
 */
export async function rebuildCache(): Promise<{
  /** Keys that were targeted for eviction */
  evictedKeys: string[];
}> {
  const hotKeys: string[] = [marketCacheKeys.all];

  // DEL accepts multiple keys in a single round-trip; run them in parallel
  // per-key so we get individual results for logging.
  await Promise.all(hotKeys.map((k) => redisConnection.del(k)));

  return { evictedKeys: hotKeys };
}

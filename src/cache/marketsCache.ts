/**
 * @module marketsCache
 *
 * Redis-backed cache invalidation helpers for market data.
 *
 * Cache keys
 * ──────────
 *   markets:all       – aggregated list of all markets (TTL 60 s)
 *   markets:{id}      – single market detail (TTL 120 s)
 *
 * Invalidation is fire-and-forget: a Redis failure never aborts the
 * business operation.  Errors are logged with the correlation ID so
 * they are observable without breaking the request path.
 */

import { redisConnection } from "../queue";
import { logger } from "../config/logger";

// ---------------------------------------------------------------------------
// Cache key helpers
// ---------------------------------------------------------------------------

export const marketCacheKeys = {
  /** Cache key for a single market by ID. */
  byId: (marketId: string) => `markets:${marketId}`,
  /** Cache key for the aggregated markets list. */
  all: "markets:all",
} as const;

// ---------------------------------------------------------------------------
// Invalidation
// ---------------------------------------------------------------------------

/**
 * Removes both the per-market and aggregated-list cache entries from Redis.
 *
 * Designed to be called after a successful market update so that
 * subsequent reads reflect the new state from the database.
 *
 * Safe to call without `await` if callers prefer fire-and-forget
 * semantics; errors are caught internally and logged, never re-thrown.
 *
 * @param marketId - The ID of the market whose cache should be purged.
 */
export async function invalidateMarketCache(marketId: string): Promise<void> {
  const keys = [marketCacheKeys.byId(marketId), marketCacheKeys.all];
  try {
    await Promise.all(keys.map((k) => redisConnection.del(k)));
    logger.debug({ marketId, keys }, "market_cache_invalidated");
  } catch (err) {
    // Cache errors must never fail the business operation.
    logger.warn({ err, marketId, keys }, "market_cache_invalidation_failed");
  }
}

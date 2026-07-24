/**
 * marketsCache.ts
 *
 * Cache key helpers and invalidation logic for market-related data.
 * Uses the shared Redis connection from the queue module.
 *
 * Cache keys:
 *   markets:all          – full market list  (TTL 60 s)
 *   markets:{id}         – single market     (TTL 120 s)
 *   markets:{id}:prediction-count  – per-market count (TTL 60 s)
 *
 * Cache errors are swallowed and logged; they must never fail the caller.
 */

import { redisConnection } from "../queue";
import { logger } from "../config/logger";
import { getRequestId } from "../lib/requestContext";

export const marketCacheKeys = {
  all: "markets:all",
  byId: (id: string) => `markets:${id}`,
  predictionCount: (id: string) => `markets:${id}:prediction-count`,
};

/**
 * Invalidates the per-market and the aggregated list cache entries.
 * Safe to call from inside a DB transaction — errors are logged, not thrown.
 */
export async function invalidateMarketCache(marketId: string): Promise<void> {
  const keys = [marketCacheKeys.byId(marketId), marketCacheKeys.all];
  try {
    await Promise.all(keys.map((k) => redisConnection.del(k)));
    logger.info(
      { requestId: getRequestId(), marketId, keys },
      "Market cache invalidated",
    );
  } catch (err) {
    logger.error(
      { requestId: getRequestId(), marketId, err },
      "Failed to invalidate market cache",
    );
  }
}

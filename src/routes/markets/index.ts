import { Router } from "express";
import { listMarkets, listUpcomingMarkets, getMarketById, updateMarket, VersionConflictError } from "../services/marketService";
import { searchMarkets } from "../repositories/marketRepository";
import { requireAdmin, AuthenticatedRequest } from "../middleware/auth";
import { rateLimitAnon } from "../middleware/rateLimitAnon";
import { listFeaturedMarkets } from "../services/marketFeatureService";
import { z } from "zod";
import { logger } from "../../config/logger";
import { RouteErrorFactory } from "../../errors";

export const marketsRouter = Router();

import { disputesRouter } from "./disputes";
marketsRouter.use("/:id/disputes", disputesRouter);

marketsRouter.use(rateLimitAnon);
marketsRouter.use("/trending", trendingRouter);

marketsRouter.use("/:id/audit", marketAuditRouter);

const patchMarketSchema = z.object({
  question: z.string().optional(),
  metadata: z.any().optional(),
  expectedVersion: z.number().int().nonnegative(),
}).strict();

marketsRouter.get("/search", async (req, res, next) => {
  const reqId = String((req as any).id ?? "anon");
  try {
    const q = req.query.q as string;
    if (typeof q !== "string" || !q.trim()) {
      throw RouteErrorFactory.badRequest("Search query parameter 'q' is required");
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || (parseInt(req.query.page as string) > 1 ? (parseInt(req.query.page as string) - 1) * limit : 0);
    const page = parseInt(req.query.page as string) || Math.floor(offset / limit) + 1;

    logger.info({ reqId, correlationId: reqId, query: q, limit, offset }, "markets_search_executed");

    const result = await searchMarkets({ query: q, limit, offset });

    return res.status(200).json({
      data: result.data,
      total: result.total,
      limit,
      offset,
      page,
      fallback: result.fallback,
      pagination: {
        limit,
        offset,
        page,
        total: result.total,
        fallback: result.fallback,
      },
      meta: {
        limit,
        offset,
        page,
        total: result.total,
        fallback: result.fallback,
      },
    });
  } catch (err) {
    logger.error({ reqId, correlationId: reqId, err }, "markets_search_failed");
    return next(err);
  }
});

marketsRouter.get("/", async (req, res, next) => {
  const reqId = String((req as any).id ?? "anon");
  try {
    if (req.query.limit !== undefined && (isNaN(Number(req.query.limit)) || Number(req.query.limit) > 100)) {
      throw RouteErrorFactory.validation("Limit must be a number between 1 and 100");
    }

    logger.debug({ reqId, correlationId: reqId, limit: req.query.limit }, "markets_list_fetching");
    const data = await listMarkets();

    logger.info({ reqId, correlationId: reqId, count: data.length }, "markets_list_success");
    return res.json({ data });
  } catch (e) {
    logger.error({ reqId, correlationId: reqId, err: e }, "markets_list_failed");
    return next(e);
  }
});

marketsRouter.get("/featured", async (req, res, next) => {
  try {
    const rawLimit = req.query.limit;
    let parsedLimit: number | undefined;
    if (rawLimit !== undefined) {
      const num = Number(rawLimit);
      if (!Number.isFinite(num) || num < 1 || num > 20) {
        throw RouteErrorFactory.validation("limit must be an integer between 1 and 20");
      }
      parsedLimit = Math.floor(num);
    }
    const data = await listFeaturedMarkets(parsedLimit);
    return res.json({ data });
  } catch (e) {
    return next(e);
  }
});

marketsRouter.get("/upcoming", async (req, res, next) => {
  const reqId = String((req as any).id ?? "anon");
  try {
    if (
      req.query.limit !== undefined &&
      (isNaN(Number(req.query.limit)) || Number(req.query.limit) < 1 || Number(req.query.limit) > 100)
    ) {
      throw RouteErrorFactory.validation("limit must be between 1 and 100");
    }
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : 50;
    const data = await listUpcomingMarkets({ limit });
    logger.info({ reqId, correlationId: reqId, count: data.length }, "markets_upcoming_listed");
    return res.json({ data });
  } catch (err) {
    logger.error({ reqId, correlationId: reqId, err }, "markets_upcoming_failed");
    return next(err);
  }
});

marketsRouter.get("/:id", async (req, res, next) => {
  const reqId = String((req as any).id ?? "anon");
  const marketId = req.params.id as string;

  try {
    if (!marketId || typeof marketId !== "string") {
      throw RouteErrorFactory.badRequest("Market ID is required and must be a string");
    }

    logger.debug({ reqId, correlationId: reqId, marketId }, "markets_get_fetching");
    const market = await getMarketById(marketId);

    if (!market) {
      throw RouteErrorFactory.notFound(`Market with ID ${marketId} not found`);
    }

    logger.info({ reqId, correlationId: reqId, marketId }, "markets_get_success");
    return res.json({ data: market });
  } catch (e) {
    logger.error({ reqId, correlationId: reqId, marketId, err: e }, "markets_get_failed");
    return next(e);
  }
});

marketsRouter.patch("/:id", requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  const reqId = String((req as any).id ?? "anon");
  const marketId = req.params.id as string;
  const adminAddress = req.user?.stellarAddress;

  try {
    const parsed = patchMarketSchema.safeParse(req.body);
    if (!parsed.success) {
      throw RouteErrorFactory.validation("Invalid request body");
    }

    const { question, metadata, expectedVersion } = parsed.data;

    const patch: { question?: string; metadata?: any } = {};
    if (question !== undefined) patch.question = question;
    if (metadata !== undefined) patch.metadata = metadata;

    logger.info(
      {
        reqId,
        correlationId: reqId,
        marketId,
        adminAddress,
        expectedVersion,
        fieldsUpdated: Object.keys(patch),
      },
      "markets_patch_updating"
    );

    const updated = await updateMarket(marketId, patch, expectedVersion, adminAddress!);

    logger.info(
      {
        reqId,
        correlationId: reqId,
        marketId,
        adminAddress,
        newVersion: updated.version,
      },
      "markets_patch_success"
    );
    return res.json({ data: updated });
  } catch (e) {
    if (e instanceof VersionConflictError) {
      logger.warn(
        {
          reqId,
          correlationId: reqId,
          marketId,
          adminAddress,
        },
        "markets_patch_version_conflict"
      );
      throw RouteErrorFactory.conflict("Market has been modified by another request. Please refresh and try again.");
    }

    if ((e as any).status === 404) {
      logger.warn({ reqId, correlationId: reqId, marketId, adminAddress }, "markets_patch_not_found");
      throw RouteErrorFactory.notFound(`Market with ID ${marketId} not found`);
    }

    logger.error(
      { reqId, correlationId: reqId, marketId, adminAddress, err: e },
      "markets_patch_failed"
    );
    return next(e);
  }
});

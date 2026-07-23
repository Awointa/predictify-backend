import { Router, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { requireAdmin } from "../../middleware/requireAdmin";
import {
  featureMarket,
  unfeatureMarket,
  MarketArchivedError,
  MarketNotFoundError,
} from "../../services/marketFeatureService";
import { RouteErrorFactory } from "../../errors";

function extractClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]!;
  }
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

const paramsSchema = z.object({
  id: z.string().trim().min(1).max(255),
});

function requestIdOf(req: { id?: unknown }): string {
  return typeof req.id === "string" ? req.id : "";
}

export interface AdminMarketsRouterOptions {
  rateLimitPerMinute?: number;
}

export function createAdminMarketsRouter(
  opts: AdminMarketsRouterOptions = {},
): Router {
  const router = Router();
  const limit = opts.rateLimitPerMinute ?? 60;

  router.use(
    rateLimit({
      windowMs: 60_000,
      limit,
      keyGenerator: (req) =>
        (req.headers.authorization as string | undefined) ?? req.ip ?? "unknown",
      standardHeaders: "draft-6",
      legacyHeaders: false,
      message: { error: { code: "rate_limit_exceeded" } },
    }),
  );

  router.use(requireAdmin);

  const handle = async (
    req: import("express").Request,
    res: import("express").Response,
    operation: "feature" | "unfeature",
  ): Promise<void> => {
    const parsed = paramsSchema.safeParse(req.params);
    const requestId = requestIdOf({ id: req.id });

    if (!parsed.success) {
      throw RouteErrorFactory.validation("Invalid market ID");
    }

    if (!req.adminAddress) {
      throw RouteErrorFactory.unauthorized("Authentication required");
    }

    const handler = operation === "feature" ? featureMarket : unfeatureMarket;
    try {
      const result = await handler(parsed.data.id, req.adminAddress, {
        ip: extractClientIp(req),
        correlationId: requestId,
      });
      res.status(200).json({ data: result });
    } catch (err) {
      if (err instanceof MarketNotFoundError) {
        throw RouteErrorFactory.notFound("Market not found");
      }
      if (err instanceof MarketArchivedError) {
        throw RouteErrorFactory.badRequest(err.message);
      }
      throw err;
    }
  };

  router.post("/:id/feature", async (req, res, next) => {
    try {
      await handle(req, res, "feature");
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id/feature", async (req, res, next) => {
    try {
      await handle(req, res, "unfeature");
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const adminMarketsRouter = createAdminMarketsRouter();

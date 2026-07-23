import { Router } from "express";
import { z } from "zod";
import { getUserByAddress, getUserPredictions, getCurrentUserProfile, getUserProfile } from "../services/userService";
import { requireAuthForbidden } from "../middleware/requireAuth";
import { AuthenticatedRequest } from "../middleware/auth";
import { logger } from "../config/logger";
import { getRequestId } from "../lib/requestContext";
import { RouteErrorFactory } from "../errors";

export const usersRouter = Router();

const stellarAddressSchema = z.string().regex(/^G[A-Z2-7]{55}$/, "Invalid Stellar address");

usersRouter.get("/me", requireAuthForbidden, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const result = await getCurrentUserProfile(userId);

    if (!result.ok) {
      throw result.error;
    }

    const profile = result.value;
    logger.info(
      { userId, stellarAddress: profile.stellarAddress, ...profile.totals },
      "user_me_profile_loaded",
    );
    return res.json({ data: profile });
  } catch (e) {
    return next(e);
  }
});

usersRouter.get("/:address/predictions", async (req, res, next) => {
  try {
    const address = req.params.address as string;
    const { status, cursor, limit = "20" } = req.query;

    const addressResult = stellarAddressSchema.safeParse(address);
    if (!addressResult.success) {
      throw RouteErrorFactory.validation("Invalid Stellar address");
    }

    const querySchema = z.object({
      status: z.enum(["pending", "confirmed", "won", "lost", "claimed"]).optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100),
    });

    const query = querySchema.parse({ status, cursor, limit: parseInt(limit as string) });

    const user = await getUserByAddress(address);
    if (!user) {
      throw RouteErrorFactory.notFound("User not found");
    }

    const result = await getUserPredictions(user.id, {
      status: query.status,
      limit: query.limit,
      cursor: query.cursor,
    });

    return res.json({
      data: result.data,
      nextCursor: result.nextCursor,
    });
  } catch (e) {
    return next(e);
  }
});

usersRouter.get(
  "/:stellarAddress/profile",
  async (req, res, next) => {
    const reqId = getRequestId();

    const parseResult = stellarAddressSchema.safeParse(req.params.stellarAddress);
    if (!parseResult.success) {
      logger.warn(
        { reqId, stellarAddress: req.params.stellarAddress, issues: parseResult.error.issues },
        "user_profile_validation_failed",
      );
      throw RouteErrorFactory.validation(parseResult.error.issues[0]?.message ?? "invalid stellar address");
    }

    const stellarAddress = parseResult.data;

    try {
      logger.debug({ reqId, stellarAddress }, "user_profile_lookup");

      const profile = await getUserProfile(stellarAddress);

      if (!profile) {
        logger.debug({ reqId, stellarAddress }, "user_profile_not_found");
        throw RouteErrorFactory.notFound("no user found with that stellar address");
      }

      logger.debug(
        { reqId, stellarAddress, predictionCount: profile.predictions.length },
        "user_profile_found",
      );

      return res.json({ data: profile });
    } catch (err) {
      return next(err);
    }
  },
);

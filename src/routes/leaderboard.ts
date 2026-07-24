import { Router } from "express";
import { z } from "zod";
import { getLeaderboard, getLeaderboardWithRefresh, getUserLeaderboardEntry } from "../services/leaderboardService";
import { rateLimitAnon } from "../middleware/rateLimitAnon";
import { RouteErrorFactory } from "../errors";

export const leaderboardRouter = Router();

leaderboardRouter.use(rateLimitAnon);

export enum LeaderboardPeriod {
  ALL_TIME = "all-time",
  MONTHLY = "monthly",
  WEEKLY = "weekly",
}

const leaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  refresh: z.coerce.boolean().default(false),
  period: z.nativeEnum(LeaderboardPeriod).default(LeaderboardPeriod.ALL_TIME),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

leaderboardRouter.get("/", async (req, res, next) => {
  try {
    const { limit, offset, refresh, period } = leaderboardQuerySchema.parse(req.query);
    
    const data = refresh 
      ? await getLeaderboardWithRefresh(limit, offset, period)
      : await getLeaderboard(limit, offset, period);
    
    res.json({ 
      data,
      meta: {
        limit,
        offset,
        count: data.length,
        refresh,
        period,
      }
    });
  } catch (e) {
    next(e);
  }
});

leaderboardRouter.get("/user/:stellarAddress", async (req, res, next) => {
  try {
    const { period } = z.object({
      period: z.nativeEnum(LeaderboardPeriod).default(LeaderboardPeriod.ALL_TIME),
    }).parse(req.query);

    const entry = await getUserLeaderboardEntry(req.params.stellarAddress, period);
    if (!entry) {
      throw RouteErrorFactory.notFound("Leaderboard entry not found");
    }
    res.json({ data: entry });
  } catch (e) {
    next(e);
  }
});

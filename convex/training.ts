import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

function getLevel(xp: number): string {
  if (xp < 100) return "Beginner";
  if (xp < 500) return "Elementary";
  if (xp < 2000) return "Intermediate";
  return "Advanced";
}

function getNextReview(correct: boolean, currentXp: number): number {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  if (!correct) return now + hour; // wrong: review in 1h
  if (currentXp < 30) return now + 4 * hour; // early: 4h
  if (currentXp < 60) return now + 24 * hour; // learning: 1 day
  return now + 7 * 24 * hour; // mastered: 7 days
}

export const submitAnswer = mutation({
  args: {
    wordId: v.id("words"),
    correct: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const word = await ctx.db.get(args.wordId);
    if (!word || word.userId !== userId) throw new Error("Not found");

    const xpDelta = args.correct ? 10 : -5;
    const newXp = Math.max(0, word.xp + xpDelta);
    const newStatus =
      newXp >= 100 ? "mastered" : newXp >= 30 ? "learning" : "new";

    await ctx.db.patch(args.wordId, {
      xp: newXp,
      status: newStatus,
      lastPracticed: Date.now(),
      nextReview: getNextReview(args.correct, newXp),
    });

    await ctx.db.insert("trainingSession", {
      userId,
      wordId: args.wordId,
      correct: args.correct,
      timestamp: Date.now(),
    });

    // Update userStats
    const stats = await ctx.db
      .query("userStats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const today = new Date().toISOString().split("T")[0];

    if (!stats) {
      await ctx.db.insert("userStats", {
        userId,
        totalXP: Math.max(0, xpDelta),
        streak: 1,
        lastActiveDate: today,
        level: getLevel(Math.max(0, xpDelta)),
      });
    } else {
      const newTotal = Math.max(0, stats.totalXP + xpDelta);
      const yesterday = new Date(Date.now() - 86400000)
        .toISOString()
        .split("T")[0];
      const newStreak =
        stats.lastActiveDate === today
          ? stats.streak
          : stats.lastActiveDate === yesterday
            ? stats.streak + 1
            : 1;
      await ctx.db.patch(stats._id, {
        totalXP: newTotal,
        streak: newStreak,
        lastActiveDate: today,
        level: getLevel(newTotal),
      });
    }
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return ctx.db
      .query("userStats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

export const getWrongAnswerOptions = query({
  args: { wordId: v.id("words") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const all = await ctx.db
      .query("words")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const others = all.filter((w) => w._id !== args.wordId);
    const shuffled = others.sort(() => Math.random() - 0.5).slice(0, 3);
    return shuffled.map((w) => w.translation);
  },
});

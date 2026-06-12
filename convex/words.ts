import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return ctx.db
      .query("words")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const add = mutation({
  args: {
    word: v.string(),
    translation: v.string(),
    example: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return ctx.db.insert("words", {
      userId,
      word: args.word,
      translation: args.translation,
      example: args.example,
      status: "new",
      xp: 0,
    });
  },
});

export const remove = mutation({
  args: { wordId: v.id("words") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const word = await ctx.db.get(args.wordId);
    if (!word || word.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(args.wordId);
  },
});

export const getLastN = query({
  args: { n: v.number() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const all = await ctx.db
      .query("words")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return all.slice(0, args.n);
  },
});

export const bulkAdd = mutation({
  args: {
    words: v.array(
      v.object({
        word: v.string(),
        translation: v.string(),
        example: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    for (const w of args.words) {
      await ctx.db.insert("words", {
        userId,
        word: w.word,
        translation: w.translation,
        example: w.example,
        status: "new",
        xp: 0,
      });
    }
  },
});

export const update = mutation({
  args: {
    wordId: v.id("words"),
    word: v.string(),
    translation: v.string(),
    example: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const existing = await ctx.db.get(args.wordId);
    if (!existing || existing.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(args.wordId, {
      word: args.word,
      translation: args.translation,
      example: args.example,
    });
  },
});

export const getForTraining = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const now = Date.now();
    const all = await ctx.db
      .query("words")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    // Prioritize: due for review first, then new words, then by xp ascending
    const due = all.filter((w) => !w.nextReview || w.nextReview <= now);
    const sorted = due.sort((a, b) => a.xp - b.xp);
    return sorted.slice(0, 10);
  },
});

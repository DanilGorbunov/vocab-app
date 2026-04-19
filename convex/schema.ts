import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  words: defineTable({
    userId: v.string(),
    word: v.string(),
    translation: v.string(),
    example: v.optional(v.string()),
    status: v.union(v.literal("new"), v.literal("learning"), v.literal("mastered")),
    xp: v.number(),
    lastPracticed: v.optional(v.number()),
    nextReview: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  trainingSession: defineTable({
    userId: v.string(),
    wordId: v.id("words"),
    correct: v.boolean(),
    timestamp: v.number(),
  }).index("by_user", ["userId"]),

  userStats: defineTable({
    userId: v.string(),
    totalXP: v.number(),
    streak: v.number(),
    lastActiveDate: v.string(),
    level: v.string(),
  }).index("by_user", ["userId"]),

  generatedTexts: defineTable({
    userId: v.string(),
    topic: v.optional(v.string()),
    paragraphs: v.array(v.object({ en: v.string(), uk: v.string() })),
    wordsUsed: v.array(v.string()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
});

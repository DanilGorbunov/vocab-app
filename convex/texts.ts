import { v } from "convex/values";
import { action, query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api } from "./_generated/api";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return ctx.db
      .query("generatedTexts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const remove = mutation({
  args: { textId: v.id("generatedTexts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const text = await ctx.db.get(args.textId);
    if (!text || text.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(args.textId);
  },
});

export const generate = action({
  args: {
    topic: v.optional(v.string()),
    paragraphCount: v.number(), // 2–10
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Get last 10 words
    const words = await ctx.runQuery(api.words.getLastN, { n: 10 });
    if (words.length < 2) {
      return { success: false, error: "Add at least 2 words first." };
    }

    const wordList = words.map((w: { word: string; translation: string }) => `${w.word} (${w.translation})`).join(", ");
    const count = Math.min(Math.max(args.paragraphCount, 2), 10);
    const topicLine = args.topic
      ? `The topic/theme for the text is: "${args.topic}".`
      : "Choose any natural topic that fits the words.";

    const prompt = `You are an English teacher creating reading material for a Ukrainian student at B1-B2 level.

Write a text with exactly ${count} paragraphs using ALL of these words naturally: ${wordList}.

${topicLine}

Rules:
- Each paragraph: 3-5 sentences, B1-B2 level English
- Use every word from the list at least once across all paragraphs
- Ukrainian translation must be natural, not word-for-word

Return ONLY valid JSON, no markdown, no explanation:
{
  "paragraphs": [
    { "en": "English paragraph text...", "uk": "Ukrainian translation..." },
    ...
  ]
}`;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set in Convex env");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error: ${err}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? "";

    let parsed: { paragraphs: { en: string; uk: string }[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Could not parse OpenAI response");
      parsed = JSON.parse(match[0]);
    }

    await ctx.runMutation(api.texts.save, {
      userId,
      topic: args.topic,
      paragraphs: parsed.paragraphs,
      wordsUsed: words.map((w: { word: string }) => w.word),
    });

    return { success: true };
  },
});

export const save = mutation({
  args: {
    userId: v.string(),
    topic: v.optional(v.string()),
    paragraphs: v.array(v.object({ en: v.string(), uk: v.string() })),
    wordsUsed: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("generatedTexts", {
      userId: args.userId,
      topic: args.topic,
      paragraphs: args.paragraphs,
      wordsUsed: args.wordsUsed,
      createdAt: Date.now(),
    });
  },
});

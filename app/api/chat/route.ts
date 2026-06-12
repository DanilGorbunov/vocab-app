import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { messages, words } = await req.json();
    const apiKey = process.env.My_Eng_GPT_API;
    if (!apiKey) return NextResponse.json({ error: "API key not configured" }, { status: 500 });

    const wordList = words?.length
      ? words.map((w: { word: string; translation: string }) => `"${w.word}"`).join(", ")
      : "";

    const systemPrompt = wordList
      ? `You are a friendly English conversation partner helping a Ukrainian speaker practice English. The user is actively learning these vocabulary words: ${wordList}. Naturally weave 1-2 of these words into each of your responses where they fit organically — don't force them all at once. Keep responses conversational and concise (2-4 sentences). When you use one of the target words, you may gently highlight it by wrapping it in asterisks like *word*.`
      : `You are a friendly English conversation partner. Be conversational, encouraging, and keep responses concise (2-4 sentences).`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 300,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: err?.error?.message ?? "API error" }, { status: 500 });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ content });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

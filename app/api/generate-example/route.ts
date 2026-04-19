import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { word, translation } = await req.json();
    if (!word) return NextResponse.json({ error: "No word provided" }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API key not configured" }, { status: 500 });

    const prompt = `Write one natural example sentence in English (B1-B2 level) using the word "${word}"${translation ? ` (meaning: ${translation})` : ""}.

Rules:
- One sentence only, no quotes, no explanation
- The sentence must clearly show the meaning of the word
- Natural, everyday English

Reply with just the sentence, nothing else.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 100,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "API error" }, { status: 500 });
    }

    const data = await res.json();
    const sentence = data.content?.[0]?.text?.trim() ?? "";
    return NextResponse.json({ sentence });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

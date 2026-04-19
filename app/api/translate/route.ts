import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { word } = await req.json();
    if (!word) return NextResponse.json({ error: "No word" }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API key not configured" }, { status: 500 });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 30,
        messages: [{
          role: "user",
          content: `Translate the English word or phrase "${word}" to Ukrainian. Reply with only the translation, nothing else. No explanations, no punctuation at the end.`,
        }],
      }),
    });

    if (!res.ok) return NextResponse.json({ error: "API error" }, { status: 500 });

    const data = await res.json();
    const translation = data.content?.[0]?.text?.trim() ?? "";
    return NextResponse.json({ translation });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

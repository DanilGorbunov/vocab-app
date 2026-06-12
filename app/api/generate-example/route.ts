import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { word, translation } = await req.json();
    if (!word) return NextResponse.json({ error: "No word provided" }, { status: 400 });

    const apiKey = process.env.My_Eng_GPT_API;
    if (!apiKey) return NextResponse.json({ error: "API key not configured" }, { status: 500 });

    const prompt = `Write one natural example sentence in English (B1-B2 level) using the word or phrase "${word}".

${translation ? `Ukrainian meaning provided: "${translation}"` : ""}

Rules:
- First, make sure you understand the REAL meaning of "${word}" as an idiom or collocation — do NOT guess from individual words
- "Pockets of time" means brief free moments, NOT money. "Carve out time" means to find time, NOT to cut. Use the actual idiomatic meaning.
- One sentence only, no quotes, no explanation
- The sentence must clearly demonstrate the correct idiomatic meaning
- Natural, everyday English (B1-B2 level)

Reply with just the sentence, nothing else.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 100,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: err?.error?.message ?? "API error" }, { status: 500 });
    }

    const data = await res.json();
    const sentence = data.choices?.[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ sentence });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

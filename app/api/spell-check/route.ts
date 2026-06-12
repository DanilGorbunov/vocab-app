import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text?.trim()) return NextResponse.json({ hasErrors: false });

    const apiKey = process.env.My_Eng_GPT_API;
    if (!apiKey) return NextResponse.json({ error: "API key not configured" }, { status: 500 });

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 150,
        messages: [
          {
            role: "user",
            content: `Check the spelling and grammar of this English word or phrase: "${text}"

If there are NO mistakes, reply with exactly the word: OK

If there ARE spelling or grammar mistakes, reply with ONLY this JSON (no markdown, no explanation):
{"corrected":"the corrected phrase","mistakes":[{"wrong":"misspelled","right":"correct"}]}

Only flag real spelling errors. Do not change word choice, style, or meaning.`,
          },
        ],
      }),
    });

    if (!res.ok) return NextResponse.json({ hasErrors: false });

    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content ?? "").trim();

    if (raw === "OK" || raw.toUpperCase() === "OK") {
      return NextResponse.json({ hasErrors: false });
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ hasErrors: false });

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      hasErrors: true,
      corrected: parsed.corrected ?? text,
      mistakes: parsed.mistakes ?? [],
    });
  } catch {
    return NextResponse.json({ hasErrors: false });
  }
}

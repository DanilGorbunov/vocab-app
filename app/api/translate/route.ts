import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { word, example } = await req.json();
    if (!word) return NextResponse.json({ error: "No word" }, { status: 400 });

    const apiKey = process.env.My_Eng_GPT_API;
    if (!apiKey) return NextResponse.json({ error: "API key not configured" }, { status: 500 });

    const prompt = example
      ? `Translate the English word or phrase "${word}" to Ukrainian.\n\nContext sentence: "${example}"\n\nRules:\n- Translate the MEANING as used in this context, not word by word\n- If it's an idiom or multi-word expression, give its natural Ukrainian equivalent\n- Reply with ONLY the Ukrainian translation, nothing else. No punctuation at the end.`
      : `Translate the English word or phrase "${word}" to Ukrainian.\n\nRules:\n- If it's an idiom or multi-word expression, translate the MEANING, not word by word\n- Give the most natural Ukrainian equivalent\n- Reply with ONLY the Ukrainian translation, nothing else. No punctuation at the end.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 40,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: err?.error?.message ?? "API error" }, { status: 500 });
    }

    const data = await res.json();
    const translation = data.choices?.[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ translation });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

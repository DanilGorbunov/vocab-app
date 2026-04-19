import { NextRequest, NextResponse } from "next/server";

const MODELS = [
  "claude-sonnet-4-20250514",
  "claude-haiku-4-5-20251001",
];

const PROMPT = (wordList: string, count: number, topicLine: string) =>
  `You are an English teacher creating reading material for a Ukrainian student at B1-B2 level.

Write a text with exactly ${count} paragraphs using ALL of these words naturally: ${wordList}.

${topicLine}

Rules:
- Each paragraph: 3-5 sentences, B1-B2 level English
- Use every word from the list at least once across all paragraphs
- Ukrainian translation must be natural, not word-for-word

Return ONLY valid JSON, no markdown, no explanation:
{"paragraphs":[{"en":"paragraph text","uk":"Ukrainian translation"}]}`;

async function callClaude(
  apiKey: string,
  prompt: string,
  modelIndex = 0,
  attempt = 1
): Promise<{ ok: boolean; status: number; text: string }> {
  const model = MODELS[modelIndex];

  let text = "";
  let status = 500;
  let ok = false;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    status = res.status;
    ok = res.ok;
    text = await res.text();
  } catch (e) {
    return { ok: false, status: 500, text: String(e) };
  }

  // Retry same model once on overload, then try next model
  if (status === 529 || (status === 500 && !ok)) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 2000));
      return callClaude(apiKey, prompt, modelIndex, attempt + 1);
    }
    if (modelIndex < MODELS.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
      return callClaude(apiKey, prompt, modelIndex + 1, 1);
    }
  }

  return { ok, status, text };
}

export async function POST(req: NextRequest) {
  try {
    const { words, topic, paragraphCount } = await req.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    const wordList = words
      .map((w: { word: string; translation: string }) => `${w.word} (${w.translation})`)
      .join(", ");
    const count = Math.min(Math.max(paragraphCount ?? 4, 2), 10);
    const topicLine = topic
      ? `The topic/theme: "${topic}".`
      : "Choose any natural topic that fits the words.";

    const { ok, status, text } = await callClaude(apiKey, PROMPT(wordList, count, topicLine));

    if (!ok) {
      const isOverloaded = status === 529;
      return NextResponse.json(
        { error: isOverloaded ? "Claude is busy, try again in a moment." : `API error: ${text}` },
        { status }
      );
    }

    // Parse the Anthropic response envelope
    let raw = "";
    try {
      const envelope = JSON.parse(text);
      raw = envelope.content?.[0]?.text ?? "";
    } catch {
      return NextResponse.json({ error: "Could not read API response" }, { status: 500 });
    }

    // Parse the actual JSON payload from Claude
    try {
      const parsed = JSON.parse(raw);
      return NextResponse.json(parsed);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        return NextResponse.json({ error: "Could not parse Claude response" }, { status: 500 });
      }
      return NextResponse.json(JSON.parse(match[0]));
    }
  } catch (e) {
    return NextResponse.json({ error: `Server error: ${String(e)}` }, { status: 500 });
  }
}

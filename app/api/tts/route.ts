import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text, simple } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "No text" }, { status: 400 });
    }

    const apiKey = process.env.My_Eng_GPT_API;
    if (!apiKey) return NextResponse.json({ error: "API key not configured" }, { status: 500 });

    // Step 1: Generate speech with OpenAI TTS
    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "nova",
        input: text,
        response_format: "mp3",
      }),
    });

    if (!ttsRes.ok) {
      const err = await ttsRes.json().catch(() => ({}));
      return NextResponse.json({ error: err?.error?.message ?? "TTS API error" }, { status: 500 });
    }

    const audioBuffer = await ttsRes.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    // simple=true: skip Whisper (no word timestamps needed, faster)
    if (simple) {
      return NextResponse.json({ audioBase64 });
    }

    // Step 2: Transcribe with Whisper to get word timestamps
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
    formData.append("file", audioBlob, "audio.mp3");
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "word");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: formData,
    });

    let words: { word: string; start: number; end: number }[] = [];
    if (whisperRes.ok) {
      const whisperData = await whisperRes.json();
      words = whisperData.words ?? [];
    }

    return NextResponse.json({ audioBase64, words });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

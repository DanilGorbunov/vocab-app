import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/)([^&\n?#\s]+)/,
    /youtube\.com\/embed\/([^&\n?#\s]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "No URL provided" }, { status: 400 });

    const videoId = extractVideoId(url);
    if (!videoId) return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });

    const raw = await YoutubeTranscript.fetchTranscript(videoId, { lang: "en" });

    if (!raw?.length) {
      return NextResponse.json(
        { error: "No English captions found. Try a video with English subtitles." },
        { status: 404 }
      );
    }

    const segments = raw.map((s) => ({
      start: s.offset / 1000,
      dur: s.duration / 1000,
      text: s.text.replace(/\n/g, " ").trim(),
    }));

    // Get video title from YouTube oEmbed
    let title = "";
    try {
      const oembed = await fetch(
        `https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`
      );
      if (oembed.ok) title = (await oembed.json()).title ?? "";
    } catch {
      // title is optional
    }

    return NextResponse.json({ videoId, title, segments });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (msg.includes("Could not find") || msg.includes("disabled") || msg.includes("No captions")) {
      return NextResponse.json(
        { error: "No captions available. Try a video with English subtitles (TED talks, lectures, news)." },
        { status: 404 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

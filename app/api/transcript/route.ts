import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

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

// Extracts a JSON array at `key` from raw HTML — properly skips string contents
function extractJsonArray(html: string, key: string): unknown[] | null {
  const needle = `"${key}":`;
  const keyIdx = html.indexOf(needle);
  if (keyIdx === -1) return null;
  const start = html.indexOf("[", keyIdx + needle.length);
  if (start === -1) return null;

  let depth = 0;
  let inStr = false;
  let escaped = false;

  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (escaped) { escaped = false; continue; }
    if (c === "\\" && inStr) { escaped = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(html.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

type CaptionTrack = { baseUrl: string; languageCode: string; kind?: string };

// Fetch the watch page and extract captionTracks from ytInitialPlayerResponse
async function getTracksFromPage(videoId: string, userAgent: string): Promise<CaptionTrack[] | null> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      "User-Agent": userAgent,
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) return null;
  const html = await res.text();
  if (!html.includes("captionTracks")) return null;
  const tracks = extractJsonArray(html, "captionTracks");
  return tracks?.length ? (tracks as CaptionTrack[]) : null;
}

async function fetchSegments(baseUrl: string) {
  const res = await fetch(baseUrl + "&fmt=json3", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  if (!res.ok) throw new Error(`Transcript fetch failed: ${res.status}`);
  const data = await res.json();
  return (data.events ?? [])
    .filter((e: Record<string, unknown>) => Array.isArray(e.segs))
    .map((e: Record<string, unknown>) => ({
      start: typeof e.tStartMs === "number" ? e.tStartMs / 1000 : 0,
      dur: typeof e.dDurationMs === "number" ? e.dDurationMs / 1000 : 0,
      text: (e.segs as { utf8?: string }[]).map((s) => s.utf8 ?? "").join("").replace(/\n/g, " ").trim(),
    }))
    .filter((s: { text: string }) => s.text.length > 0);
}

const USER_AGENTS = [
  // Mobile Android
  "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Mobile Safari/537.36",
  // Desktop Chrome
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  // iOS Safari
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1",
  // Googlebot (sometimes bypasses bot checks)
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
];

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "No URL provided" }, { status: 400 });

    const videoId = extractVideoId(url);
    if (!videoId) return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });

    let tracks: CaptionTrack[] | null = null;
    for (const ua of USER_AGENTS) {
      try {
        tracks = await getTracksFromPage(videoId, ua);
        if (tracks) break;
      } catch {
        continue;
      }
    }

    if (!tracks?.length) {
      return NextResponse.json(
        { error: "No captions available. Try a video with English subtitles (TED talks, lectures, news)." },
        { status: 404 }
      );
    }

    const track =
      tracks.find((t) => t.languageCode === "en" && !t.kind) ??
      tracks.find((t) => t.languageCode?.startsWith("en") && !t.kind) ??
      tracks.find((t) => t.languageCode === "en") ??
      tracks.find((t) => t.languageCode?.startsWith("en")) ??
      tracks[0];

    if (!track?.baseUrl) {
      return NextResponse.json({ error: "No caption URL found." }, { status: 404 });
    }

    const segments = await fetchSegments(track.baseUrl);

    if (!segments.length) {
      return NextResponse.json(
        { error: "No captions available. Try a video with English subtitles (TED talks, lectures, news)." },
        { status: 404 }
      );
    }

    let title = "";
    try {
      const oembed = await fetch(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`);
      if (oembed.ok) title = (await oembed.json()).title ?? "";
    } catch { /* optional */ }

    return NextResponse.json({ videoId, title, segments });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

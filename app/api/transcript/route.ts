import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const ANDROID_VERSION = "20.10.38";
const ANDROID_UA = `com.google.android.youtube/${ANDROID_VERSION} (Linux; U; Android 14)`;
const WEB_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)";

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

type CaptionTrack = { baseUrl: string; languageCode: string; kind?: string };

// Strategy 1: InnerTube ANDROID — works when not IP-blocked
async function getTracksViaInnerTube(videoId: string): Promise<CaptionTrack[] | null> {
  const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": ANDROID_UA },
    body: JSON.stringify({
      videoId,
      context: { client: { clientName: "ANDROID", clientVersion: ANDROID_VERSION, hl: "en", gl: "US" } },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const tracks: CaptionTrack[] = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  return tracks.length ? tracks : null;
}

// Strategy 2: HTML page scrape — fallback when InnerTube is IP-blocked
async function getTracksViaPage(videoId: string): Promise<CaptionTrack[] | null> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { "User-Agent": WEB_UA, "Accept-Language": "en" },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const token = "var ytInitialPlayerResponse = ";
  const start = html.indexOf(token);
  if (start === -1) return null;
  const jsonStart = start + token.length;
  let depth = 0;
  for (let i = jsonStart; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          const obj = JSON.parse(html.slice(jsonStart, i + 1));
          const tracks: CaptionTrack[] = obj?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
          return tracks.length ? tracks : null;
        } catch { return null; }
      }
    }
  }
  return null;
}

function decodeXml(s: string) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function parseXml(xml: string) {
  const segments: { start: number; dur: number; text: string }[] = [];
  const re = /<text[^>]+start="([^"]+)"[^>]*dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const text = decodeXml(m[3].replace(/<[^>]+>/g, "")).replace(/\n/g, " ").trim();
    if (text) segments.push({ start: parseFloat(m[1]), dur: parseFloat(m[2]), text });
  }
  return segments;
}

async function fetchXml(track: CaptionTrack) {
  const baseUrl = track.baseUrl.startsWith("/")
    ? `https://www.youtube.com${track.baseUrl}`
    : track.baseUrl;
  const res = await fetch(baseUrl, { headers: { "User-Agent": WEB_UA, "Accept-Language": "en" } });
  if (!res.ok) throw new Error(`Timedtext failed: ${res.status}`);
  return res.text();
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "No URL provided" }, { status: 400 });

    const videoId = extractVideoId(url);
    if (!videoId) return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });

    // Try InnerTube first, then HTML scrape
    let tracks = await getTracksViaInnerTube(videoId).catch(() => null);
    if (!tracks?.length) tracks = await getTracksViaPage(videoId).catch(() => null);

    if (!tracks?.length) {
      return NextResponse.json(
        { error: "No captions available. Try a video with English subtitles (TED talks, lectures, news)." },
        { status: 404 }
      );
    }

    const track =
      tracks.find((t) => t.languageCode === "en" && !t.kind) ??
      tracks.find((t) => t.languageCode === "en") ??
      tracks.find((t) => t.languageCode?.startsWith("en")) ??
      tracks[0];

    const xml = await fetchXml(track);
    const segments = parseXml(xml);

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

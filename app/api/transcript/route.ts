import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge"; // Runs on Cloudflare edge, not AWS Lambda — bypasses YouTube IP blocks

const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

// Try multiple clients in order — Vercel IPs may be blocked for some
const CLIENTS = [
  {
    clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
    clientVersion: "2.0",
    clientNameId: "85",
    userAgent: "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1",
    embedUrl: "https://www.youtube.com/",
  },
  {
    clientName: "WEB_EMBEDDED_PLAYER",
    clientVersion: "1.20231204.01.00",
    clientNameId: "56",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    embedUrl: "https://www.youtube.com/",
  },
  {
    clientName: "ANDROID",
    clientVersion: "19.09.37",
    clientNameId: "3",
    userAgent: "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip",
    embedUrl: null,
  },
  {
    clientName: "IOS",
    clientVersion: "19.09.3",
    clientNameId: "5",
    userAgent: "com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)",
    embedUrl: null,
  },
] as const;

type CaptionTrack = { baseUrl: string; languageCode: string };

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

async function getCaptionTracks(videoId: string, client: typeof CLIENTS[number]): Promise<CaptionTrack[] | null> {
  const context: Record<string, unknown> = {
    client: {
      clientName: client.clientName,
      clientVersion: client.clientVersion,
      hl: "en",
      gl: "US",
    },
    ...(client.embedUrl ? { thirdParty: { embedUrl: client.embedUrl } } : {}),
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": client.userAgent,
    "X-YouTube-Client-Name": client.clientNameId,
    "X-YouTube-Client-Version": client.clientVersion,
    "Accept-Language": "en-US,en;q=0.9",
    ...(client.embedUrl ? { "Origin": "https://www.youtube.com", "Referer": "https://www.youtube.com/" } : {}),
  };

  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}&prettyPrint=false`,
    { method: "POST", headers, body: JSON.stringify({ videoId, context }) }
  );

  if (!res.ok) return null;
  const data = await res.json();
  const tracks: CaptionTrack[] = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  return tracks.length > 0 ? tracks : null;
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

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "No URL provided" }, { status: 400 });

    const videoId = extractVideoId(url);
    if (!videoId) return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });

    let tracks: CaptionTrack[] | null = null;
    for (const client of CLIENTS) {
      try {
        tracks = await getCaptionTracks(videoId, client);
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

    const track = tracks.find((t) => t.languageCode === "en")
      ?? tracks.find((t) => t.languageCode?.startsWith("en"))
      ?? tracks[0];

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
    } catch { /* title is optional */ }

    return NextResponse.json({ videoId, title, segments });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

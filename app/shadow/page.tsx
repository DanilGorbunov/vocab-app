"use client";

import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useGuestWords } from "@/hooks/useGuestWords";
import { AppNav } from "@/components/AppNav";
import { SaveBanner } from "@/components/SaveBanner";
import { SpeakButton } from "@/components/SpeakButton";
import { useState, useRef, useEffect } from "react";

const HISTORY_KEY = "vocab_shadow_history";

type Segment = { start: number; dur: number; text: string };
type SavedVideo = {
  id: string;
  url: string;
  videoId: string;
  title: string;
  addedCount: number;
  createdAt: number;
};
type Tip = { text: string; x: number; y: number; trans: string | null; loading: boolean };

declare global {
  interface Window { YT: any; onYouTubeIframeAPIReady: () => void; }
}

function loadHistory(): SavedVideo[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"); } catch { return []; }
}
function persistHistory(h: SavedVideo[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
}

function tokenize(text: string, addedSet: Set<string>) {
  return text.split(" ").map((raw) => {
    const clean = raw.replace(/^[^a-zA-Z'']+|[^a-zA-Z'']+$/g, "").toLowerCase();
    return { raw, clean, isWord: clean.length > 0, isAdded: clean.length > 1 && addedSet.has(clean) };
  });
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

export default function ShadowPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const isGuest = !isLoading && !isAuthenticated;

  const convexWords = useQuery(api.words.list);
  const addConvexWord = useMutation(api.words.add);
  const { words: guestWords, add: addGuest } = useGuestWords();

  const words = isGuest ? guestWords : (convexWords ?? []);
  const addedSet = new Set(words.map((w) => w.word.toLowerCase()));

  // History
  const [history, setHistory] = useState<SavedVideo[]>([]);
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  // Current session
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [videoId, setVideoId] = useState("");
  const [title, setTitle] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [addedCount, setAddedCount] = useState(0);
  const [shadowMode, setShadowMode] = useState(false);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);

  // Tooltip
  const [tip, setTip] = useState<Tip | null>(null);
  const [tipStatus, setTipStatus] = useState<"idle" | "added" | "duplicate">("idle");
  const tipRef = useRef<HTMLDivElement>(null);

  const playerRef = useRef<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const playerDivRef = useRef<HTMLDivElement>(null);
  const segmentsRef = useRef<Segment[]>([]); // stable ref for polling closure

  useEffect(() => { setHistory(loadHistory()); }, []);

  // Close tooltip on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (tipRef.current?.contains(e.target as Node)) return;
      setTip(null); setTipStatus("idle");
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // YouTube player
  useEffect(() => {
    if (!videoId) return;
    const initPlayer = () => {
      if (!playerDivRef.current) return;
      playerRef.current = new window.YT.Player(playerDivRef.current, {
        videoId,
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onStateChange: (e: any) => {
            if (e.data === 1) startPolling();
            else stopPolling();
          },
        },
      });
    };
    if (window.YT?.Player) initPlayer();
    else {
      window.onYouTubeIframeAPIReady = initPlayer;
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
    }
    return () => { stopPolling(); playerRef.current?.destroy?.(); playerRef.current = null; };
  }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  function startPolling() {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      const t = playerRef.current?.getCurrentTime?.();
      if (t == null) return;
      setCurrentIdx(segmentsRef.current.findLastIndex((s) => s.start <= t));
    }, 400);
  }

  function stopPolling() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }

  useEffect(() => {
    if (currentIdx >= 0) segmentRefs.current[currentIdx]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentIdx]);

  async function fetchTranscript(targetUrl?: string) {
    const url = (targetUrl ?? urlInput).trim();
    if (!url) return;
    setFetching(true);
    setFetchError("");
    setSegments([]);
    segmentsRef.current = [];
    setVideoId("");
    setCurrentIdx(-1);

    try {
      const res = await fetch("/api/transcript", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.error) {
        setFetchError(data.error);
      } else {
        setVideoId(data.videoId);
        setTitle(data.title ?? "");
        setSegments(data.segments ?? []);
        segmentsRef.current = data.segments ?? [];

        // Upsert history entry (preserve existing addedCount)
        const existing = loadHistory();
        const existIdx = existing.findIndex((h) => h.videoId === data.videoId);
        let entry: SavedVideo;
        if (existIdx >= 0) {
          entry = { ...existing[existIdx], title: data.title ?? existing[existIdx].title };
          existing.splice(existIdx, 1);
        } else {
          entry = { id: Date.now().toString(), url, videoId: data.videoId, title: data.title ?? "", addedCount: 0, createdAt: Date.now() };
        }
        const updated = [entry, ...existing];
        persistHistory(updated);
        setHistory(updated);
        setCurrentHistoryId(entry.id);
        setAddedCount(entry.addedCount);
        setUrlInput("");
        setShowUrlForm(false);
      }
    } catch {
      setFetchError("Failed to fetch transcript. Check your connection.");
    } finally {
      setFetching(false);
    }
  }

  function handleBackToList() {
    stopPolling();
    playerRef.current?.destroy?.();
    playerRef.current = null;
    setVideoId(""); setSegments([]); segmentsRef.current = [];
    setTitle(""); setCurrentIdx(-1); setTip(null); setCurrentHistoryId(null);
  }

  function seekTo(start: number) {
    playerRef.current?.seekTo?.(start, true);
    playerRef.current?.playVideo?.();
  }

  async function handleWordClick(phrase: string, x: number, y: number) {
    setTip({ text: phrase, x, y, trans: null, loading: true });
    setTipStatus("idle");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ word: phrase }),
      });
      const d = await res.json();
      setTip((prev) => prev && prev.text === phrase ? { ...prev, trans: d.translation ?? null, loading: false } : prev);
    } catch {
      setTip((prev) => prev ? { ...prev, loading: false } : null);
    }
  }

  function handleAddWord() {
    if (!tip?.trans) return;
    const exists = words.some((w) => w.word.toLowerCase() === tip.text.toLowerCase());
    if (exists) { setTipStatus("duplicate"); return; }
    if (isGuest) addGuest(tip.text, tip.trans);
    else addConvexWord({ word: tip.text, translation: tip.trans });
    const newCount = addedCount + 1;
    setAddedCount(newCount);
    if (currentHistoryId) {
      setHistory((prev) => {
        const updated = prev.map((h) => h.id === currentHistoryId ? { ...h, addedCount: newCount } : h);
        persistHistory(updated);
        return updated;
      });
    }
    setTipStatus("added");
    setTimeout(() => { setTip(null); setTipStatus("idle"); }, 900);
  }

  if (isLoading) return null;

  return (
    <div className={`flex min-h-screen flex-col bg-[#f7f7f5] ${isGuest ? "pt-12" : ""}`}>
      {isGuest && <SaveBanner count={guestWords.length} />}

      <div className="mx-auto w-full max-w-lg px-4 pb-28 pt-6">

        {/* ── Video mode ── */}
        {videoId ? (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <button onClick={handleBackToList} className="text-sm text-zinc-400 hover:text-zinc-700">
                ← My videos
              </button>
              <div className="flex items-center gap-3">
                {addedCount > 0 && (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    +{addedCount} added
                  </span>
                )}
                <button
                  onClick={() => setShadowMode((v) => !v)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    shadowMode ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {shadowMode ? "🔇 Shadow" : "🔊 Normal"}
                </button>
              </div>
            </div>

            {/* YouTube player */}
            <div className="mb-4 overflow-hidden rounded-2xl shadow-sm" style={{ aspectRatio: "16/9" }}>
              {shadowMode ? (
                <div className="flex h-full items-center justify-center bg-zinc-900 text-white">
                  <div className="text-center">
                    <p className="text-4xl mb-2">🎧</p>
                    <p className="text-sm text-zinc-400">Audio only — focus on listening</p>
                    <button onClick={() => setShadowMode(false)} className="mt-3 text-xs text-zinc-500 hover:text-white">Show video</button>
                  </div>
                  <div ref={playerDivRef} className="hidden" />
                </div>
              ) : (
                <div ref={playerDivRef} className="h-full w-full" />
              )}
            </div>

            {title && <p className="mb-3 text-xs font-medium text-zinc-500 truncate">{title}</p>}

            {/* Hint */}
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
              <span className="text-sm">👆</span>
              <p className="text-xs text-amber-700">Click any word to translate · timestamp to seek</p>
            </div>

            {/* Transcript */}
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden">
              <div className="border-b border-zinc-100 px-4 py-2.5">
                <p className="text-xs font-medium text-zinc-400">
                  {fetching ? "Loading…" : `${segments.length} segments`}
                </p>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <div className="px-4 py-3 flex flex-col gap-0.5">
                  {segments.map((seg, i) => (
                    <div
                      key={i}
                      ref={(el) => { segmentRefs.current[i] = el; }}
                      className={`group rounded-lg px-2 py-1.5 text-sm leading-relaxed ${i === currentIdx ? "bg-zinc-900" : ""}`}
                    >
                      {/* Timestamp — click to seek */}
                      <span
                        onClick={() => seekTo(seg.start)}
                        className={`mr-2 text-[10px] font-mono tabular-nums cursor-pointer select-none ${
                          i === currentIdx ? "text-zinc-400" : "text-zinc-300 group-hover:text-zinc-400"
                        }`}
                      >
                        {formatTime(seg.start)}
                      </span>

                      {/* Tokenized words */}
                      {tokenize(seg.text, addedSet).map((token, wi) => (
                        <span key={wi}>
                          {wi > 0 && <span className={i === currentIdx ? "text-zinc-300" : "text-zinc-500"}> </span>}
                          {token.isWord ? (
                            <span
                              onClick={(e) => {
                                const sel = window.getSelection();
                                if (sel && sel.toString().trim().split(/\s+/).length > 1) return;
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                handleWordClick(token.clean, rect.left + rect.width / 2, rect.top);
                              }}
                              title="Click to translate"
                              className={[
                                "cursor-pointer rounded-sm px-0.5 transition-colors duration-100",
                                i === currentIdx
                                  ? token.isAdded
                                    ? "text-emerald-300 underline decoration-emerald-400 underline-offset-2"
                                    : "text-white hover:bg-zinc-700"
                                  : token.isAdded
                                  ? "text-emerald-700 underline decoration-emerald-400 decoration-2 underline-offset-2"
                                  : "text-zinc-700 hover:bg-amber-100",
                              ].join(" ")}
                            >
                              {token.raw}
                            </span>
                          ) : (
                            <span className={i === currentIdx ? "text-zinc-300" : "text-zinc-500"}>{token.raw}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Word tooltip */}
            {tip && (
              <div
                ref={tipRef}
                className="fixed z-50 flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-xl -translate-x-1/2 -translate-y-full pointer-events-auto"
                style={{ left: tip.x, top: tip.y - 10 }}
              >
                {tip.loading ? (
                  <>
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-600 border-t-white shrink-0" />
                    <span className="text-zinc-400">Translating…</span>
                  </>
                ) : tipStatus === "added" ? (
                  <span className="text-emerald-400">✓ Added!</span>
                ) : tipStatus === "duplicate" ? (
                  <span className="text-zinc-400">Already in your list</span>
                ) : (
                  <>
                    <span className="max-w-[200px] truncate">{tip.trans ?? "…"}</span>
                    {tip.trans && (
                      <span className="border-l border-zinc-700 pl-1.5">
                        <SpeakButton text={tip.text} className="text-zinc-400 hover:text-white" />
                      </span>
                    )}
                    {tip.trans && (
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handleAddWord}
                        className="border-l border-zinc-700 pl-1.5 text-emerald-400 hover:text-emerald-300 font-bold text-sm"
                      >
                        + Add
                      </button>
                    )}
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setTip(null); setTipStatus("idle"); }}
                      className="border-l border-zinc-700 pl-1.5 text-zinc-500 hover:text-white"
                    >
                      ×
                    </button>
                  </>
                )}
                <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
              </div>
            )}
          </div>

        ) : (
          /* ── Library mode ── */
          <div>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-zinc-900">Shadowing</h1>
                <p className="mt-1 text-sm text-zinc-400">Listen, repeat, and build vocabulary</p>
              </div>
              <button
                onClick={() => setShowUrlForm((v) => !v)}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
              >
                + Add video
              </button>
            </div>

            {/* URL form */}
            {showUrlForm && (
              <div className="mb-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-100">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">YouTube URL</p>
                <div className="flex gap-2">
                  <input
                    autoFocus
                    placeholder="https://youtube.com/watch?v=..."
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchTranscript()}
                    className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-zinc-400"
                  />
                  <button
                    onClick={() => fetchTranscript()}
                    disabled={fetching || !urlInput.trim()}
                    className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40"
                  >
                    {fetching ? "Loading…" : "Load"}
                  </button>
                </div>
                {fetchError && <p className="mt-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{fetchError}</p>}
                <p className="mt-2 text-xs text-zinc-400">Works best with English videos that have captions (TED talks, lectures, news)</p>
                <button
                  onClick={() => { setShowUrlForm(false); setUrlInput(""); setFetchError(""); }}
                  className="mt-3 text-xs text-zinc-400 hover:text-zinc-700"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* History list */}
            {history.length === 0 && !showUrlForm ? (
              <div className="rounded-2xl border-2 border-dashed border-zinc-200 bg-white/50 px-6 py-12 text-center">
                <p className="text-sm text-zinc-400">No videos yet — paste a YouTube link to start</p>
                <button
                  onClick={() => setShowUrlForm(true)}
                  className="mt-3 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
                >
                  + Add first video
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="group rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-zinc-100 cursor-pointer hover:ring-zinc-300 transition"
                    onClick={() => fetchTranscript(entry.url)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-800 line-clamp-2 leading-snug">
                          {entry.title || entry.url}
                        </p>
                        <div className="mt-1.5 flex items-center gap-3">
                          <span className="text-xs text-zinc-400">
                            {new Date(entry.createdAt).toLocaleDateString("uk-UA", { day: "numeric", month: "short" })}
                          </span>
                          {entry.addedCount > 0 && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              {entry.addedCount} слів додано
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setHistory((prev) => { const u = prev.filter((h) => h.id !== entry.id); persistHistory(u); return u; }); }}
                        className="shrink-0 rounded-lg p-1.5 text-zinc-200 hover:bg-red-50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <AppNav />
    </div>
  );
}

"use client";

import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useGuestWords } from "@/hooks/useGuestWords";
import { AppNav } from "@/components/AppNav";
import { SaveBanner } from "@/components/SaveBanner";
import { SpeakButton } from "@/components/SpeakButton";
import { useState, useEffect, useRef } from "react";

// ── localStorage keys ────────────────────────────────────────────────────────
const TEXTS_KEY = "vocab_read_texts";   // array of SavedText
const ACTIVE_KEY = "vocab_read_active"; // id of last opened text

// ── Types ────────────────────────────────────────────────────────────────────
type MarkedWord = { word: string; translation: string };
type SavedText = {
  id: string;
  text: string;
  title: string;       // first ~60 chars
  createdAt: number;
  markedWords: MarkedWord[];
};

type Tip = { text: string; x: number; y: number; trans: string | null; loading: boolean };

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeTitle(text: string) {
  return text.trim().slice(0, 60).replace(/\s+/g, " ") + (text.length > 60 ? "…" : "");
}
function loadTexts(): SavedText[] {
  try { return JSON.parse(localStorage.getItem(TEXTS_KEY) ?? "[]"); } catch { return []; }
}
function saveTexts(texts: SavedText[]) {
  localStorage.setItem(TEXTS_KEY, JSON.stringify(texts));
}

// ── Tokenize text, tracking word index for TTS highlighting ─────────────────
function parseTokens(text: string, addedSet: Set<string>, currentWordIdx: number) {
  let wIdx = 0;
  return text.split("\n").map((para) => {
    return para.split(" ").map((raw) => {
      const clean = raw.replace(/^[^a-zA-Z'']+|[^a-zA-Z'']+$/g, "").toLowerCase();
      const isWord = clean.length > 0;
      const thisIdx = isWord ? wIdx++ : -1;
      return {
        raw, clean, isWord,
        isAdded: isWord && clean.length > 1 && addedSet.has(clean),
        isCurrent: isWord && thisIdx === currentWordIdx,
      };
    });
  });
}

// ── Interactive text renderer ────────────────────────────────────────────────
function InteractiveText({
  text, addedSet, onSelect, currentWordIdx = -1,
}: {
  text: string; addedSet: Set<string>;
  onSelect: (phrase: string, x: number, y: number) => void;
  currentWordIdx?: number;
}) {
  const paragraphs = parseTokens(text, addedSet, currentWordIdx);

  function handleMouseUp() {
    setTimeout(() => {
      const sel = window.getSelection();
      const selected = sel?.toString().trim();
      if (selected && selected.split(/\s+/).length > 1) {
        const rect = sel!.getRangeAt(0).getBoundingClientRect();
        onSelect(selected, rect.left + rect.width / 2, rect.top);
      }
    }, 30);
  }

  return (
    <div onMouseUp={handleMouseUp} className="select-text">
      {paragraphs.map((words, pi) => (
        <p key={pi} className={`leading-[2.1] text-base text-zinc-800 ${pi > 0 ? "mt-4" : ""}`}>
          {words.map((token, wi) => (
            <span key={wi}>
              {wi > 0 && " "}
              {token.isWord ? (
                <span
                  onClick={(e) => {
                    const sel = window.getSelection();
                    if (sel && sel.toString().trim().split(/\s+/).length > 1) return;
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    onSelect(token.clean, rect.left + rect.width / 2, rect.top);
                  }}
                  title="Click to translate"
                  className={[
                    "cursor-pointer rounded-sm px-0.5 transition-colors duration-100",
                    token.isCurrent
                      ? "bg-blue-200 text-blue-900 rounded"
                      : token.isAdded
                      ? "bg-emerald-50 text-emerald-700 underline decoration-emerald-400 decoration-2 underline-offset-2"
                      : "hover:bg-amber-100",
                  ].join(" ")}
                >
                  {token.raw}
                </span>
              ) : (
                <span>{token.raw}</span>
              )}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ReadPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const isGuest = !isLoading && !isAuthenticated;

  const convexWords = useQuery(api.words.list);
  const addConvexWord = useMutation(api.words.add);
  const removeConvexWord = useMutation(api.words.remove);
  const updateConvexWord = useMutation(api.words.update);
  const { words: guestWords, add: addGuest, remove: removeGuest, updateWord: updateGuestWord } = useGuestWords();

  const [texts, setTexts] = useState<SavedText[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [rawText, setRawText] = useState("");

  const [tip, setTip] = useState<Tip | null>(null);
  const [tipStatus, setTipStatus] = useState<"idle" | "added" | "duplicate">("idle");
  const tipRef = useRef<HTMLDivElement>(null);

  // Edit state for session list
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editWord, setEditWord] = useState("");
  const [editTranslation, setEditTranslation] = useState("");

  // TTS state
  const [speechState, setSpeechState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [currentWordIdx, setCurrentWordIdx] = useState(-1);
  const [speechRate, setSpeechRate] = useState(1.0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wordTimingsRef = useRef<{ word: string; start: number; end: number }[]>([]);
  const audioBlobUrlRef = useRef<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = loadTexts();
    setTexts(saved);
    const lastId = localStorage.getItem(ACTIVE_KEY);
    if (lastId && saved.find((t) => t.id === lastId)) setActiveId(lastId);
  }, []);

  // Close tooltip on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (tipRef.current?.contains(e.target as Node)) return;
      setTip(null); setTipStatus("idle");
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Stop TTS on unmount
  useEffect(() => () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (audioBlobUrlRef.current) { URL.revokeObjectURL(audioBlobUrlRef.current); }
  }, []);

  // Stop TTS when switching texts
  useEffect(() => { stopSpeech(); }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const words = isGuest ? guestWords : (convexWords ?? []);
  const addedSet = new Set(words.map((w) => w.word.toLowerCase()));

  const activeText = texts.find((t) => t.id === activeId) ?? null;

  // ── TTS controls ──────────────────────────────────────────────────────────
  async function startSpeech(text: string) {
    // Cleanup previous
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (audioBlobUrlRef.current) { URL.revokeObjectURL(audioBlobUrlRef.current); audioBlobUrlRef.current = null; }

    setSpeechState("loading");
    setCurrentWordIdx(-1);

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "TTS failed");

      wordTimingsRef.current = data.words ?? [];

      // Build blob URL from base64 audio
      const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      audioBlobUrlRef.current = url;

      const audio = new Audio(url);
      audio.playbackRate = speechRate;
      audioRef.current = audio;

      audio.ontimeupdate = () => {
        const t = audio.currentTime;
        const timings = wordTimingsRef.current;
        let idx = -1;
        for (let i = 0; i < timings.length; i++) {
          if (t >= timings[i].start && (i === timings.length - 1 || t < timings[i + 1].start)) {
            idx = i;
            break;
          }
        }
        setCurrentWordIdx(idx);
      };

      audio.onended = () => { setSpeechState("idle"); setCurrentWordIdx(-1); };
      audio.onerror = () => { setSpeechState("idle"); setCurrentWordIdx(-1); };

      await audio.play();
      setSpeechState("playing");
    } catch {
      setSpeechState("idle");
    }
  }

  function pauseSpeech() {
    audioRef.current?.pause();
    setSpeechState("paused");
  }

  function resumeSpeech() {
    audioRef.current?.play();
    setSpeechState("playing");
  }

  function stopSpeech() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (audioBlobUrlRef.current) { URL.revokeObjectURL(audioBlobUrlRef.current); audioBlobUrlRef.current = null; }
    setSpeechState("idle");
    setCurrentWordIdx(-1);
  }

  // ── Text CRUD ──────────────────────────────────────────────────────────────
  function handleSaveNewText() {
    const text = rawText.trim();
    if (!text) return;
    const newEntry: SavedText = {
      id: Date.now().toString(),
      text,
      title: makeTitle(text),
      createdAt: Date.now(),
      markedWords: [],
    };
    const updated = [newEntry, ...texts];
    setTexts(updated);
    saveTexts(updated);
    setActiveId(newEntry.id);
    localStorage.setItem(ACTIVE_KEY, newEntry.id);
    setRawText("");
    setShowNewForm(false);
  }

  function handleOpenText(id: string) {
    setActiveId(id);
    localStorage.setItem(ACTIVE_KEY, id);
    setEditingIdx(null);
  }

  function handleDeleteText(id: string) {
    const updated = texts.filter((t) => t.id !== id);
    setTexts(updated);
    saveTexts(updated);
    if (activeId === id) {
      setActiveId(null);
      localStorage.removeItem(ACTIVE_KEY);
    }
  }

  function handleBackToList() {
    stopSpeech();
    setActiveId(null);
    setTip(null);
    setEditingIdx(null);
  }

  // ── Word CRUD in active text ───────────────────────────────────────────────
  function updateActiveText(updater: (t: SavedText) => SavedText) {
    setTexts((prev) => {
      const updated = prev.map((t) => (t.id === activeId ? updater(t) : t));
      saveTexts(updated);
      return updated;
    });
  }

  async function handleSelect(phrase: string, x: number, y: number) {
    setTip({ text: phrase, x, y, trans: null, loading: true });
    setTipStatus("idle");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ word: phrase }),
      });
      const d = await res.json();
      setTip((prev) =>
        prev && prev.text === phrase ? { ...prev, trans: d.translation ?? null, loading: false } : prev
      );
    } catch {
      setTip((prev) => (prev ? { ...prev, loading: false } : null));
    }
  }

  function handleAdd() {
    if (!tip?.trans || !activeId) return;
    const exists = words.some((w) => w.word.toLowerCase() === tip.text.toLowerCase());
    if (exists) { setTipStatus("duplicate"); return; }
    if (isGuest) addGuest(tip.text, tip.trans);
    else addConvexWord({ word: tip.text, translation: tip.trans });
    const newWord = { word: tip.text, translation: tip.trans };
    updateActiveText((t) => ({ ...t, markedWords: [...t.markedWords, newWord] }));
    setTipStatus("added");
    setTimeout(() => { setTip(null); setTipStatus("idle"); }, 900);
  }

  function handleDeleteWord(idx: number) {
    if (!activeText) return;
    const phrase = activeText.markedWords[idx];
    const vocabWord = words.find((w) => w.word.toLowerCase() === phrase.word.toLowerCase());
    if (vocabWord) {
      if (isGuest) removeGuest((vocabWord as any).id);
      else removeConvexWord({ wordId: (vocabWord as any)._id });
    }
    updateActiveText((t) => ({ ...t, markedWords: t.markedWords.filter((_, i) => i !== idx) }));
    if (editingIdx === idx) setEditingIdx(null);
  }

  function startEditWord(idx: number) {
    if (!activeText) return;
    setEditingIdx(idx);
    setEditWord(activeText.markedWords[idx].word);
    setEditTranslation(activeText.markedWords[idx].translation);
  }

  async function saveEditWord(idx: number) {
    if (!activeText) return;
    const w = editWord.trim(); const t = editTranslation.trim();
    if (!w || !t) return;
    const old = activeText.markedWords[idx];
    const vocabWord = words.find((v) => v.word.toLowerCase() === old.word.toLowerCase());
    if (vocabWord) {
      if (isGuest) updateGuestWord((vocabWord as any).id, { word: w, translation: t });
      else await updateConvexWord({ wordId: (vocabWord as any)._id, word: w, translation: t });
    }
    updateActiveText((t2) => ({
      ...t2,
      markedWords: t2.markedWords.map((p, i) => (i === idx ? { word: w, translation: t } : p)),
    }));
    setEditingIdx(null);
  }

  if (isLoading) return null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen bg-[#f7f7f5] ${isGuest ? "pt-12" : ""}`}>
      {isGuest && <SaveBanner count={guestWords.length} />}

      <div className="mx-auto max-w-lg px-4 pb-28 pt-6">

        {/* ── Reading mode ── */}
        {activeText ? (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <button onClick={handleBackToList} className="text-sm text-zinc-400 hover:text-zinc-700">
                ← My texts
              </button>
              {activeText.markedWords.length > 0 && (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  +{activeText.markedWords.length} added
                </span>
              )}
            </div>

            {/* Title */}
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 leading-snug line-clamp-2">
              {activeText.title}
            </h2>

            {/* TTS controls */}
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-white border border-zinc-100 px-3 py-2 shadow-sm">
              {speechState === "idle" && (
                <button
                  onClick={() => startSpeech(activeText.text)}
                  className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700"
                >
                  ▶ Listen
                </button>
              )}
              {speechState === "loading" && (
                <button disabled className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white opacity-70">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
                  Generating…
                </button>
              )}
              {speechState === "playing" && (
                <button
                  onClick={pauseSpeech}
                  className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700"
                >
                  ⏸ Pause
                </button>
              )}
              {speechState === "paused" && (
                <button
                  onClick={resumeSpeech}
                  className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700"
                >
                  ▶ Resume
                </button>
              )}
              {(speechState === "playing" || speechState === "paused") && (
                <button
                  onClick={stopSpeech}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100"
                >
                  ⏹ Stop
                </button>
              )}
              {/* Speed selector — instantly adjusts playback rate */}
              <div className="ml-auto flex items-center gap-1">
                {[0.8, 1.0, 1.2].map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setSpeechRate(r);
                      if (audioRef.current) audioRef.current.playbackRate = r;
                    }}
                    className={`rounded px-2 py-1 text-xs font-medium ${speechRate === r ? "bg-zinc-900 text-white" : "text-zinc-400 hover:bg-zinc-100"}`}
                  >
                    {r === 0.8 ? "0.8×" : r === 1.0 ? "1×" : "1.2×"}
                  </button>
                ))}
              </div>
            </div>

            {/* Hint */}
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
              <span className="text-sm">👆</span>
              <p className="text-xs text-amber-700">Click any word · or select a phrase · to translate and add</p>
            </div>

            {/* Text body */}
            <div className="rounded-2xl bg-white px-5 py-5 shadow-sm ring-1 ring-zinc-100">
              <InteractiveText text={activeText.text} addedSet={addedSet} onSelect={handleSelect} currentWordIdx={currentWordIdx} />
            </div>

            {/* Tooltip */}
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
                        onClick={handleAdd}
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

            {/* Added words list */}
            {activeText.markedWords.length > 0 && (
              <div className="mt-5 rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-zinc-100">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">
                  Added from this text
                </p>
                <div className="flex flex-col divide-y divide-zinc-50">
                  {activeText.markedWords.map((p, i) => (
                    <div key={i} className="py-2">
                      {editingIdx === i ? (
                        <div className="flex flex-col gap-2">
                          <input
                            autoFocus
                            value={editWord}
                            onChange={(e) => setEditWord(e.target.value)}
                            className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"
                            placeholder="English"
                          />
                          <input
                            value={editTranslation}
                            onChange={(e) => setEditTranslation(e.target.value)}
                            className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm outline-none focus:border-zinc-400"
                            placeholder="Translation"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => saveEditWord(i)} className="flex-1 rounded-lg bg-zinc-900 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700">Save</button>
                            <button onClick={() => setEditingIdx(null)} className="rounded-lg px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-zinc-800">{p.word}</span>
                            <span className="mx-2 text-zinc-300">—</span>
                            <span className="text-sm text-zinc-400">{p.translation}</span>
                          </div>
                          <button onClick={() => startEditWord(i)} className="shrink-0 rounded-lg p-1.5 text-zinc-300 hover:bg-zinc-100 hover:text-zinc-600 text-xs" title="Edit">✎</button>
                          <button onClick={() => handleDeleteWord(i)} className="shrink-0 rounded-lg p-1.5 text-zinc-300 hover:bg-red-50 hover:text-red-500 text-xs" title="Delete">✕</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        ) : (
          /* ── Library / list mode ── */
          <div>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-zinc-900">Read & Add</h1>
                <p className="mt-1 text-sm text-zinc-400">Your reading library</p>
              </div>
              <button
                onClick={() => setShowNewForm((v) => !v)}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
              >
                + Add text
              </button>
            </div>

            {/* New text form */}
            {showNewForm && (
              <div className="mb-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-100">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">New text</p>
                <textarea
                  autoFocus
                  placeholder="Paste an article, story, or any English text here…"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={8}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-relaxed text-zinc-800 outline-none focus:border-zinc-400 resize-none"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleSaveNewText}
                    disabled={!rawText.trim()}
                    className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40"
                  >
                    Save & start reading →
                  </button>
                  <button onClick={() => { setShowNewForm(false); setRawText(""); }} className="rounded-xl px-4 py-2.5 text-sm text-zinc-500 hover:bg-zinc-100">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Texts list */}
            {texts.length === 0 && !showNewForm ? (
              <div className="rounded-2xl border-2 border-dashed border-zinc-200 bg-white/50 px-6 py-12 text-center">
                <p className="text-sm text-zinc-400">No texts yet — paste an article or story to start</p>
                <button onClick={() => setShowNewForm(true)} className="mt-3 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700">
                  + Add first text
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {texts.map((t) => (
                  <div
                    key={t.id}
                    className="group rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-zinc-100 cursor-pointer hover:ring-zinc-300 transition"
                    onClick={() => handleOpenText(t.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-800 line-clamp-2 leading-snug">{t.title}</p>
                        <div className="mt-1.5 flex items-center gap-3">
                          <span className="text-xs text-zinc-400">
                            {new Date(t.createdAt).toLocaleDateString("uk-UA", { day: "numeric", month: "short" })}
                          </span>
                          {t.markedWords.length > 0 && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              {t.markedWords.length} слів додано
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteText(t.id); }}
                        className="shrink-0 rounded-lg p-1.5 text-zinc-200 hover:bg-red-50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                        title="Delete text"
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

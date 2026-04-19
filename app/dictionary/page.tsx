"use client";

import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useGuestWords, GuestWord } from "@/hooks/useGuestWords";
import { AppNav } from "@/components/AppNav";
import { SaveBanner } from "@/components/SaveBanner";
import { SpeakButton } from "@/components/SpeakButton";
import { InteractiveSentence } from "@/components/InteractiveSentence";
import { useState, useRef, useCallback } from "react";
import Link from "next/link";

const STATUS = {
  new:      { label: "New",      cls: "bg-zinc-100 text-zinc-500" },
  learning: { label: "Learning", cls: "bg-blue-100 text-blue-600" },
  mastered: { label: "Mastered", cls: "bg-emerald-100 text-emerald-600" },
};

function ExampleWithTooltip({ example, word, translation }: { example: string; word: string; translation: string }) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = example.split(new RegExp(`(${escaped})`, "i"));
  return (
    <p className="text-xs italic text-zinc-400 truncate">
      {parts.map((part, i) =>
        part.toLowerCase() === word.toLowerCase() ? (
          <span key={i} className="relative group/tip inline-block">
            <span className="underline decoration-dotted decoration-zinc-300 cursor-default text-zinc-500">{part}</span>
            <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 hidden group-hover/tip:flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              {translation}
              <span className="pointer-events-auto"><SpeakButton text={word} className="text-zinc-400 hover:text-white" /></span>
            </span>
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

type DisplayWord = {
  id: string;
  word: string;
  translation: string;
  example?: string;
  status: "new" | "learning" | "mastered";
  xp: number;
};

export default function DictionaryPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();

  const convexWords = useQuery(api.words.list);
  const addConvexWord = useMutation(api.words.add);
  const removeConvexWord = useMutation(api.words.remove);
  const stats = useQuery(api.training.getStats);

  const { words: guestWords, add: addGuest, remove: removeGuest } = useGuestWords();

  const [wordInput, setWordInput] = useState("");
  const [translation, setTranslation] = useState("");
  const [translationLoading, setTranslationLoading] = useState(false);
  const [example, setExample] = useState("");
  const [exampleLoading, setExampleLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const generateExample = useCallback(async (word: string, trans: string) => {
    if (!word.trim()) return;
    setExampleLoading(true);
    setExample("");
    try {
      const res = await fetch("/api/generate-example", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ word: word.trim(), translation: trans.trim() }),
      });
      const data = await res.json();
      if (data.sentence) setExample(data.sentence);
    } catch { /* silent */ } finally {
      setExampleLoading(false);
    }
  }, []);

  async function autoTranslate(word: string) {
    if (!word.trim() || word.trim().length < 2) return;
    setTranslationLoading(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ word: word.trim() }),
      });
      const data = await res.json();
      if (data.translation) {
        setTranslation(data.translation);
        // Once we have translation, generate example too
        generateExample(word, data.translation);
      }
    } catch { /* silent */ } finally {
      setTranslationLoading(false);
    }
  }

  // Auto-translate + generate example when word changes (debounced 700ms)
  function handleWordChange(val: string) {
    setWordInput(val);
    // Reset dependent fields
    if (translateDebounceRef.current) clearTimeout(translateDebounceRef.current);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 2) {
      translateDebounceRef.current = setTimeout(() => {
        setTranslation("");
        setExample("");
        autoTranslate(val);
      }, 700);
    } else {
      setTranslation("");
      setExample("");
    }
  }

  // Re-generate when translation is filled in and word exists
  function handleTranslationBlur() {
    if (wordInput.trim().length >= 2) {
      generateExample(wordInput, translation);
    }
  }

  const isGuest = !isLoading && !isAuthenticated;

  const words: DisplayWord[] = isGuest
    ? guestWords.map((w: GuestWord) => ({ id: w.id, word: w.word, translation: w.translation, example: w.example, status: w.status, xp: w.xp }))
    : (convexWords ?? []).map((w) => ({ id: w._id, word: w.word, translation: w.translation, example: w.example, status: w.status, xp: w.xp }));

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!wordInput.trim() || !translation.trim()) return;
    setAdding(true);
    if (isGuest) {
      addGuest(wordInput.trim(), translation.trim(), example.trim() || undefined);
    } else {
      await addConvexWord({ word: wordInput.trim(), translation: translation.trim(), example: example.trim() || undefined });
    }
    setWordInput(""); setTranslation(""); setExample(""); setExampleLoading(false);
    setShowForm(false);
    setAdding(false);
  }

  function handleRemove(id: string) {
    if (isGuest) removeGuest(id);
    else removeConvexWord({ wordId: id as Parameters<typeof removeConvexWord>[0]["wordId"] });
  }

  if (isLoading) return null;

  return (
    <div className={`min-h-screen bg-[#f7f7f5] ${isGuest ? "pt-12" : ""}`}>
      {isGuest && <SaveBanner count={guestWords.length} />}

      <div className="mx-auto max-w-lg px-4 pb-28 pt-6">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-900">My Words</h1>
          <div className="flex items-center gap-3">
            {isAuthenticated && (
              <button onClick={() => signOut()} className="text-sm text-zinc-400 hover:text-zinc-700">Sign out</button>
            )}
            {isGuest && (
              <Link href="/login" className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700">
                Sign in
              </Link>
            )}
          </div>
        </div>

        {/* Stats card — auth only */}
        {isAuthenticated && stats && (
          <div className="mb-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-100">
            <div className="flex items-center justify-between">
              <div className="flex gap-5">
                <div>
                  <p className="text-xs text-zinc-400">Level</p>
                  <p className="font-semibold text-zinc-900">{stats.level}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-400">XP</p>
                  <p className="font-semibold text-zinc-900">{stats.totalXP}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-400">Streak</p>
                  <p className="font-semibold text-zinc-900">{stats.streak} 🔥</p>
                </div>
              </div>
              <Link href="/training" className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700">
                Train →
              </Link>
            </div>
          </div>
        )}

        {/* Train CTA for guests */}
        {isGuest && words.length >= 4 && (
          <div className="mb-5">
            <Link href="/training" className="flex w-full items-center justify-center rounded-2xl bg-zinc-900 py-3.5 text-sm font-semibold text-white hover:bg-zinc-700 shadow-sm">
              🎯 Start training ({words.length} words)
            </Link>
          </div>
        )}

        {/* Add word */}
        <div className="mb-5">
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="w-full rounded-2xl border-2 border-dashed border-zinc-200 bg-white/50 py-4 text-sm font-medium text-zinc-400 hover:border-zinc-300 hover:text-zinc-600 transition"
            >
              + Add new word
            </button>
          ) : (
            <form onSubmit={handleAdd} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-100">
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-400">Add new word</p>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                    <span>🇬🇧</span> English word
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      placeholder="e.g. resilient"
                      value={wordInput}
                      onChange={(e) => handleWordChange(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-zinc-400 focus:bg-white"
                    />
                    {wordInput && <SpeakButton text={wordInput} className="shrink-0 p-1" />}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                    <span>🇺🇦</span> Ukrainian translation
                  </label>
                  <div className="relative">
                    <input
                      placeholder={translationLoading ? "Translating…" : "e.g. стійкий"}
                      value={translation}
                      onChange={(e) => setTranslation(e.target.value)}
                      onBlur={handleTranslationBlur}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-zinc-400 focus:bg-white"
                    />
                    {translationLoading && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 block" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Example sentence — AI generated */}
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 min-h-[56px]">
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-400">
                      Example sentence
                    </label>
                    {(example || exampleLoading) && wordInput && (
                      <button
                        type="button"
                        onClick={() => generateExample(wordInput, translation)}
                        className="text-xs text-zinc-400 hover:text-zinc-700"
                      >
                        ↻ regenerate
                      </button>
                    )}
                  </div>
                  {exampleLoading ? (
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
                      Generating…
                    </div>
                  ) : example ? (
                    <p className="text-sm text-zinc-700 leading-relaxed">
                      <InteractiveSentence sentence={example} />
                    </p>
                  ) : (
                    <p className="text-sm text-zinc-300">
                      {wordInput.trim().length >= 2 ? "Generating…" : "Enter a word to generate"}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={adding}
                    className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50">
                    {adding ? "Adding…" : "Add word"}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)}
                    className="rounded-xl px-4 py-2.5 text-sm text-zinc-500 hover:bg-zinc-100">
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Word count */}
        {words.length > 0 && (
          <p className="mb-3 text-xs font-medium text-zinc-400">{words.length} word{words.length !== 1 ? "s" : ""}</p>
        )}

        {/* Empty state */}
        {words.length === 0 && (
          <div className="py-12 text-center">
            <div className="mb-3 text-4xl">📖</div>
            <p className="text-sm text-zinc-500">No words yet. Add your first word above.</p>
          </div>
        )}

        {/* Word list */}
        <ul className="flex flex-col gap-2.5">
          {words.map((w) => (
            <li key={w.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-zinc-100">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-zinc-900">{w.word}</span>
                  <SpeakButton text={w.word} />
                  <span className="text-zinc-300 text-sm">→</span>
                  <span className="text-zinc-600 text-sm">{w.translation}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[w.status].cls}`}>
                    {STATUS[w.status].label}
                  </span>
                </div>
                {w.example && <ExampleWithTooltip example={w.example} word={w.word} translation={w.translation} />}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <button onClick={() => handleRemove(w.id)} className="text-zinc-200 hover:text-red-400 transition text-lg leading-none">×</button>
                <span className="text-xs text-zinc-300">{w.xp} xp</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <AppNav />
    </div>
  );
}

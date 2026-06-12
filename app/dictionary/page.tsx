"use client";

import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { AppNav } from "@/components/AppNav";
import { SpeakButton } from "@/components/SpeakButton";
import { InteractiveSentence } from "@/components/InteractiveSentence";
import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
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
    <div className="flex items-center gap-1.5 min-w-0">
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
      <SpeakButton text={example} className="shrink-0 text-zinc-200 hover:text-zinc-500" />
    </div>
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
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isAuthenticated, isLoading, router]);

  const convexWords = useQuery(api.words.list);
  const addConvexWord = useMutation(api.words.add);
  const removeConvexWord = useMutation(api.words.remove);
  const updateConvexWord = useMutation(api.words.update);
  const stats = useQuery(api.training.getStats);

  const [wordInput, setWordInput] = useState("");
  const [translation, setTranslation] = useState("");
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationFailed, setTranslationFailed] = useState(false);
  const [example, setExample] = useState("");
  const [exampleLoading, setExampleLoading] = useState(false);
  const [exampleFailed, setExampleFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWord, setEditWord] = useState("");
  const [editTranslation, setEditTranslation] = useState("");
  const [editExample, setEditExample] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editExampleLoading, setEditExampleLoading] = useState(false);
  const [spellCheck, setSpellCheck] = useState<{ corrected: string; mistakes: { wrong: string; right: string }[] } | null>(null);
  const [spellCheckLoading, setSpellCheckLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spellDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const generateExample = useCallback(async (word: string, trans: string) => {
    if (!word.trim()) return;
    setExampleLoading(true);
    setExampleFailed(false);
    setExample("");
    try {
      const res = await fetch("/api/generate-example", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ word: word.trim(), translation: trans.trim() }),
      });
      const data = await res.json();
      if (data.sentence) {
        setExample(data.sentence);
        fetch("/api/translate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ word: word.trim(), example: data.sentence }),
        })
          .then((r) => r.json())
          .then((d) => { if (d.translation) setTranslation(d.translation); })
          .catch(() => {});
      } else {
        setExampleFailed(true);
      }
    } catch {
      setExampleFailed(true);
    } finally {
      setExampleLoading(false);
    }
  }, []);

  async function autoTranslate(word: string) {
    if (!word.trim() || word.trim().length < 2) return;
    setTranslationLoading(true);
    setTranslationFailed(false);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ word: word.trim() }),
      });
      const data = await res.json();
      if (data.translation) {
        setTranslation(data.translation);
        generateExample(word, data.translation);
      } else {
        setTranslationFailed(true);
        setExampleFailed(true);
      }
    } catch {
      setTranslationFailed(true);
      setExampleFailed(true);
    } finally {
      setTranslationLoading(false);
    }
  }

  function handleWordChange(val: string) {
    setWordInput(val);
    setSpellCheck(null);
    if (translateDebounceRef.current) clearTimeout(translateDebounceRef.current);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (spellDebounceRef.current) clearTimeout(spellDebounceRef.current);
    if (val.trim().length >= 2) {
      translateDebounceRef.current = setTimeout(() => {
        setTranslation("");
        setExample("");
        setTranslationFailed(false);
        setExampleFailed(false);
        autoTranslate(val);
      }, 700);
      spellDebounceRef.current = setTimeout(async () => {
        setSpellCheckLoading(true);
        try {
          const res = await fetch("/api/spell-check", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: val.trim() }),
          });
          const data = await res.json();
          if (data.hasErrors && data.mistakes?.length > 0) {
            setSpellCheck({ corrected: data.corrected, mistakes: data.mistakes });
          }
        } catch { /* ignore */ } finally {
          setSpellCheckLoading(false);
        }
      }, 900);
    } else {
      setTranslation("");
      setExample("");
      setTranslationFailed(false);
      setExampleFailed(false);
    }
  }

  function handleTranslationBlur() {
    if (wordInput.trim().length >= 2) generateExample(wordInput, translation);
  }

  const words: DisplayWord[] = (convexWords ?? []).map((w) => ({
    id: w._id,
    word: w.word,
    translation: w.translation,
    example: w.example,
    status: w.status,
    xp: w.xp,
  }));

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!wordInput.trim() || !translation.trim()) return;
    if (words.some((x) => x.word.toLowerCase() === wordInput.trim().toLowerCase())) return;
    setAdding(true);
    await addConvexWord({ word: wordInput.trim(), translation: translation.trim(), example: example.trim() || undefined });
    setWordInput(""); setTranslation(""); setExample(""); setExampleLoading(false);
    setSpellCheck(null); setSpellCheckLoading(false);
    setShowForm(false);
    setAdding(false);
  }

  function handleRemove(id: string) {
    removeConvexWord({ wordId: id as Parameters<typeof removeConvexWord>[0]["wordId"] });
  }

  function startEdit(w: DisplayWord) {
    setEditingId(w.id);
    setEditWord(w.word);
    setEditTranslation(w.translation);
    setEditExample(w.example ?? "");
  }

  async function regenerateEditExample() {
    if (!editWord.trim()) return;
    setEditExampleLoading(true);
    setEditExample("");
    try {
      const res = await fetch("/api/generate-example", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ word: editWord.trim(), translation: editTranslation.trim() }),
      });
      const data = await res.json();
      if (data.sentence) setEditExample(data.sentence);
    } catch { /* leave empty */ } finally {
      setEditExampleLoading(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId || !editWord.trim() || !editTranslation.trim()) return;
    setEditSaving(true);
    await updateConvexWord({
      wordId: editingId as Parameters<typeof updateConvexWord>[0]["wordId"],
      word: editWord.trim(),
      translation: editTranslation.trim(),
      example: editExample.trim() || undefined,
    });
    setEditingId(null);
    setEditSaving(false);
  }

  if (isLoading || !isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-[#f7f7f5]">
      <div className="mx-auto max-w-lg px-4 pb-28 pt-6">

        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-900">My Words</h1>
          <button onClick={() => signOut()} className="text-sm text-zinc-400 hover:text-zinc-700">Sign out</button>
        </div>

        {stats && (
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
                      className={`w-full rounded-xl border bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:bg-white ${spellCheck ? "border-red-300 focus:border-red-400" : "border-zinc-200 focus:border-zinc-400"}`}
                    />
                    {wordInput && <SpeakButton text={wordInput} className="shrink-0 p-1" />}
                  </div>
                  {spellCheck && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 rounded-xl border border-red-100 bg-red-50 px-3 py-2">
                      <span className="text-xs text-red-400 font-medium shrink-0">Fix:</span>
                      {(() => {
                        let remaining = spellCheck.corrected;
                        const parts: { text: string; isWrong: boolean; wrongVal: string }[] = [];
                        for (const m of spellCheck.mistakes) {
                          const idx = remaining.toLowerCase().indexOf(m.right.toLowerCase());
                          if (idx === -1) continue;
                          if (idx > 0) parts.push({ text: remaining.slice(0, idx), isWrong: false, wrongVal: "" });
                          parts.push({ text: remaining.slice(idx, idx + m.right.length), isWrong: true, wrongVal: m.wrong });
                          remaining = remaining.slice(idx + m.right.length);
                        }
                        if (remaining) parts.push({ text: remaining, isWrong: false, wrongVal: "" });
                        return parts.map((p, i) =>
                          p.isWrong ? (
                            <button key={i} type="button"
                              onClick={() => { handleWordChange(spellCheck.corrected); setSpellCheck(null); }}
                              className="rounded bg-red-200 px-1 py-0.5 text-xs font-semibold text-red-700 underline decoration-wavy decoration-red-500 hover:bg-red-300"
                              title={`Tap to fix: ${p.wrongVal} → ${p.text}`}
                            >{p.text}</button>
                          ) : (
                            <span key={i} className="text-xs text-zinc-600">{p.text}</span>
                          )
                        );
                      })()}
                    </div>
                  )}
                  {spellCheckLoading && !spellCheck && (
                    <p className="mt-1 text-xs text-zinc-400">Checking spelling…</p>
                  )}
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
                  {translationFailed && !translation && (
                    <p className="mt-1 text-xs text-amber-600">Auto-translate unavailable — type the translation above</p>
                  )}
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 min-h-[56px]">
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-400">Example sentence</label>
                    {(example || exampleLoading) && wordInput && (
                      <button type="button" onClick={() => generateExample(wordInput, translation)}
                        className="text-xs text-zinc-400 hover:text-zinc-700">↻ regenerate</button>
                    )}
                  </div>
                  {exampleLoading ? (
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
                      Generating…
                    </div>
                  ) : example ? (
                    <p className="text-sm text-zinc-700 leading-relaxed">
                      <InteractiveSentence
                        sentence={example}
                        onAdd={(w, t) => {
                          if (words.some((x) => x.word.toLowerCase() === w.toLowerCase())) return false;
                          addConvexWord({ word: w, translation: t });
                          return true;
                        }}
                      />
                    </p>
                  ) : exampleFailed ? (
                    <p className="text-xs text-amber-600">Example generation unavailable — you can still add the word</p>
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

        {words.length > 0 && (
          <p className="mb-3 text-xs font-medium text-zinc-400">{words.length} word{words.length !== 1 ? "s" : ""}</p>
        )}

        {words.length === 0 && (
          <div className="py-12 text-center">
            <div className="mb-3 text-4xl">📖</div>
            <p className="text-sm text-zinc-500">No words yet. Add your first word above.</p>
          </div>
        )}

        <ul className="flex flex-col gap-2.5">
          {words.map((w) => (
            <li key={w.id} className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 overflow-hidden">
              {editingId === w.id ? (
                <form onSubmit={saveEdit} className="px-4 py-4 flex flex-col gap-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Edit word</p>
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-500"><span>🇬🇧</span> English word</label>
                    <input autoFocus value={editWord} onChange={(e) => setEditWord(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:bg-white" />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-500"><span>🇺🇦</span> Translation</label>
                    <input value={editTranslation} onChange={(e) => setEditTranslation(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:bg-white" />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs font-medium text-zinc-500">Example sentence</label>
                      <button type="button" onClick={regenerateEditExample} className="text-xs text-zinc-400 hover:text-zinc-700">
                        {editExampleLoading ? "Generating…" : "↻ regenerate"}
                      </button>
                    </div>
                    <textarea value={editExample} onChange={(e) => setEditExample(e.target.value)} rows={2}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:bg-white resize-none" />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={editSaving || !editWord.trim() || !editTranslation.trim()}
                      className="flex-1 rounded-xl bg-zinc-900 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50">
                      {editSaving ? "Saving…" : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="rounded-xl px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3.5">
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
                    <button onClick={() => startEdit(w)} className="text-zinc-300 hover:text-zinc-600 transition text-xs leading-none">✎</button>
                    <span className="text-xs text-zinc-300">{w.xp} xp</span>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <AppNav />
    </div>
  );
}

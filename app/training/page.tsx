"use client";

import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useGuestWords, GuestWord } from "@/hooks/useGuestWords";
import { AppNav } from "@/components/AppNav";
import { SaveBanner } from "@/components/SaveBanner";
import { SpeakButton } from "@/components/SpeakButton";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type AnyWord = {
  id: string;
  word: string;
  translation: string;
  example?: string;
  xp: number;
  status: string;
};

type Question = {
  word: AnyWord;
  options: string[];
  correct: string;
};

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function norm(s: string) { return s.trim().normalize("NFC"); }

function buildQuestions(training: AnyWord[], all: AnyWord[]): Question[] {
  return training.map((w) => {
    const correct = norm(w.translation);
    const distractors = all
      .filter((o) => o.id !== w.id)
      .sort(() => Math.random() - 0.5)
      .reduce<string[]>((acc, o) => {
        const t = norm(o.translation);
        if (t !== correct && !acc.includes(t)) acc.push(t);
        return acc;
      }, [])
      .slice(0, 3);
    return { word: w, options: shuffle([...distractors, correct]), correct };
  });
}

export default function TrainingPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();
  const isGuest = !isLoading && !isAuthenticated;

  // Auth mode
  const convexAll = useQuery(api.words.list);
  const convexTraining = useQuery(api.words.getForTraining);
  const submitAnswer = useMutation(api.training.submitAnswer);
  const stats = useQuery(api.training.getStats);

  // Guest mode
  const { words: guestWords, updateWord } = useGuestWords();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioBlobUrlRef = useRef<string | null>(null);

  // Build questions once — don't rebuild while a session is in progress
  useEffect(() => {
    if (isLoading || ready) return;

    if (isGuest) {
      if (guestWords.length < 4) return;
      const training = [...guestWords].sort(() => Math.random() - 0.5).slice(0, 10);
      const all: AnyWord[] = guestWords.map((w: GuestWord) => ({ ...w, id: w.id }));
      const trainingAny: AnyWord[] = training.map((w: GuestWord) => ({ ...w, id: w.id }));
      setQuestions(buildQuestions(trainingAny, all));
      setReady(true);
    } else {
      if (!convexAll || !convexTraining || convexAll.length < 4) return;
      const all: AnyWord[] = convexAll.map((w) => ({ id: w._id, word: w.word, translation: w.translation, example: w.example, xp: w.xp, status: w.status }));
      const source = convexTraining.length > 0 ? convexTraining : [...convexAll].sort(() => Math.random() - 0.5).slice(0, 10);
      const training: AnyWord[] = source.map((w) => ({ id: w._id, word: w.word, translation: w.translation, example: w.example, xp: w.xp, status: w.status }));
      setQuestions(buildQuestions(training, all));
      setReady(true);
    }
  }, [isLoading, ready, isGuest, guestWords, convexAll, convexTraining]);

  // Auto-play TTS when a new question appears
  useEffect(() => {
    if (!ready || questions.length === 0 || done) return;
    const q = questions[current];
    const text = q.word.example
      ? `${q.word.word}. ${q.word.example}`
      : q.word.word;

    // Cancel any previous audio
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (audioBlobUrlRef.current) { URL.revokeObjectURL(audioBlobUrlRef.current); audioBlobUrlRef.current = null; }

    setTtsPlaying(true);
    fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, simple: true }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.audioBase64) return;
        const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        audioBlobUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => setTtsPlaying(false);
        audio.onerror = () => setTtsPlaying(false);
        audio.play().catch(() => setTtsPlaying(false));
      })
      .catch(() => setTtsPlaying(false));
  }, [current, ready, done]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => () => {
    if (audioRef.current) { audioRef.current.pause(); }
    if (audioBlobUrlRef.current) { URL.revokeObjectURL(audioBlobUrlRef.current); }
  }, []);

  async function handleSelect(option: string) {
    if (selected !== null) return;
    const isCorrect = norm(option) === norm(questions[current].correct);
    setSelected(option);
    setResults((r) => [...r, isCorrect]);

    if (isGuest) {
      // Update XP locally
      const w = questions[current].word;
      const newXp = Math.max(0, w.xp + (isCorrect ? 10 : -5));
      const newStatus = newXp >= 100 ? "mastered" : newXp >= 30 ? "learning" : "new";
      updateWord(w.id, { xp: newXp, status: newStatus as GuestWord["status"], lastPracticed: Date.now() });
    } else {
      await submitAnswer({
        wordId: questions[current].word.id as Id<"words">,
        correct: isCorrect,
      });
    }
  }

  function handleNext() {
    if (current + 1 >= questions.length) {
      setDone(true);
    } else {
      setCurrent((c) => c + 1);
      setSelected(null);
    }
  }

  function reset() {
    setCurrent(0); setSelected(null); setResults([]); setDone(false); setReady(false); setQuestions([]);
  }

  // Not enough words
  const wordCount = isGuest ? guestWords.length : (convexAll?.length ?? 0);
  const dataReady = isGuest ? true : (convexAll !== undefined);

  if (!dataReady || isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5]"><p className="text-zinc-400">Loading…</p></div>;
  }

  if (wordCount < 4) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f7f7f5] px-4">
        {isGuest && <SaveBanner count={guestWords.length} />}
        <div className="text-center">
          <div className="mb-4 text-5xl">📚</div>
          <p className="mb-2 text-lg font-semibold text-zinc-800">Not enough words</p>
          <p className="mb-6 text-sm text-zinc-500">Add at least 4 words to start training.</p>
          <Link href="/dictionary" className="rounded-xl bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700">
            Go to Dictionary
          </Link>
        </div>
        <AppNav />
      </div>
    );
  }

  if (done) {
    const correct = results.filter(Boolean).length;
    const total = results.length;
    const pct = Math.round((correct / total) * 100);
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f7f7f5] px-4">
        {isGuest && <SaveBanner count={guestWords.length} />}
        <div className={`w-full max-w-sm ${isGuest ? "mt-10" : ""}`}>
          <div className="rounded-3xl bg-white p-8 shadow-sm text-center">
            <div className="mb-4 text-6xl">{correct === total ? "🎉" : correct >= total / 2 ? "👍" : "📚"}</div>
            <h2 className="mb-1 text-4xl font-bold text-zinc-900">{correct}<span className="text-zinc-300">/{total}</span></h2>
            <p className="mb-2 text-sm text-zinc-500">{pct}% correct</p>
            {!isGuest && stats && (
              <div className="my-4 flex justify-center gap-6 border-y border-zinc-100 py-4">
                <div className="text-center">
                  <p className="text-lg font-bold text-zinc-900">{stats.totalXP}</p>
                  <p className="text-xs text-zinc-400">Total XP</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-zinc-900">{stats.streak}🔥</p>
                  <p className="text-xs text-zinc-400">Streak</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-zinc-900">{stats.level}</p>
                  <p className="text-xs text-zinc-400">Level</p>
                </div>
              </div>
            )}
            {isGuest && (
              <p className="my-4 text-sm text-zinc-500">Create an account to track XP, streaks and unlock AI texts.</p>
            )}
            <div className="flex flex-col gap-2">
              <button onClick={reset} className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white hover:bg-zinc-700">
                Train again
              </button>
              {isGuest ? (
                <button onClick={() => router.push("/login")} className="w-full rounded-xl border border-zinc-200 bg-white py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                  Save progress & sign up
                </button>
              ) : (
                <Link href="/dictionary" className="block w-full rounded-xl border border-zinc-200 bg-white py-3 text-center text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                  Back to Dictionary
                </Link>
              )}
            </div>
          </div>
        </div>
        <AppNav />
      </div>
    );
  }

  if (!ready || questions.length === 0) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5]"><p className="text-zinc-400">Preparing quiz…</p></div>;
  }

  const q = questions[current];
  const isCorrect = selected === q.correct;
  const progress = ((current + (selected ? 1 : 0)) / questions.length) * 100;

  return (
    <div className={`flex min-h-screen flex-col bg-[#f7f7f5] ${isGuest ? "pt-12" : ""}`}>
      {isGuest && <SaveBanner count={guestWords.length} />}

      {/* Progress bar — full width at top */}
      <div className="h-1 w-full bg-zinc-200">
        <div className="h-1 bg-zinc-900 transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-28 pt-6">
        {/* Counter */}
        <div className="mb-8 flex items-center justify-between">
          <Link href="/dictionary" className="text-sm text-zinc-400 hover:text-zinc-700">← Back</Link>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500">
            {current + 1} / {questions.length}
          </span>
        </div>

        {/* Word card */}
        <div className="mb-8 rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">Translate to Ukrainian</p>
          <div className="flex items-center justify-center gap-3">
            <h2 className="text-4xl font-bold tracking-tight text-zinc-900">{q.word.word}</h2>
            {ttsPlaying ? (
              <span className="flex gap-[3px] items-end h-5 px-1">
                <span className="w-[3px] rounded-full bg-zinc-400 animate-[bounce_0.8s_ease-in-out_infinite]" style={{ height: "10px", animationDelay: "0ms" }} />
                <span className="w-[3px] rounded-full bg-zinc-400 animate-[bounce_0.8s_ease-in-out_infinite]" style={{ height: "14px", animationDelay: "150ms" }} />
                <span className="w-[3px] rounded-full bg-zinc-400 animate-[bounce_0.8s_ease-in-out_infinite]" style={{ height: "10px", animationDelay: "300ms" }} />
              </span>
            ) : (
              <SpeakButton text={q.word.word} className="text-zinc-300 hover:text-zinc-600 p-1" />
            )}
          </div>
          {q.word.example && (
            <p className="mt-3 text-sm italic text-zinc-400 leading-relaxed">{q.word.example}</p>
          )}
        </div>

        {/* Options */}
        <div className="flex flex-col gap-3">
          {q.options.map((option, optIdx) => {
            let base = "relative w-full rounded-2xl px-5 py-4 text-left text-sm font-medium transition-all duration-150";
            if (selected) {
              if (option === q.correct)
                base += " bg-emerald-50 text-emerald-700 ring-2 ring-emerald-400 shadow-sm";
              else if (option === selected)
                base += " bg-red-50 text-red-600 ring-2 ring-red-300";
              else
                base += " bg-white text-zinc-300 ring-1 ring-zinc-100";
            } else {
              base += " bg-white text-zinc-800 ring-1 ring-zinc-200 hover:ring-2 hover:ring-zinc-400 active:scale-[0.98] cursor-pointer shadow-sm";
            }
            return (
              <button key={`${option}-${optIdx}`} className={base} onClick={() => handleSelect(option)} disabled={!!selected}>
                {selected && option === q.correct && <span className="mr-2">✓</span>}
                {selected && option === selected && option !== q.correct && <span className="mr-2">✗</span>}
                {option}
              </button>
            );
          })}
        </div>

        {/* Feedback + next */}
        {selected && (
          <div className="mt-6">
            <div className={`mb-3 rounded-2xl px-4 py-3 text-center text-sm font-semibold ${isCorrect ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
              {isCorrect ? "✓ Correct! +10 XP" : `✗ Wrong — correct answer: ${q.correct}`}
            </div>
            <div className="mb-3 flex items-center justify-center gap-2 text-sm text-zinc-500">
              <span className="font-medium text-zinc-800">{q.word.word}</span>
              <span className="text-zinc-300">→</span>
              <span className="font-medium text-zinc-800">{q.correct}</span>
            </div>
            <button
              onClick={handleNext}
              className="w-full rounded-2xl bg-zinc-900 py-4 text-sm font-semibold text-white shadow-sm hover:bg-zinc-700 active:scale-[0.98] transition-all"
            >
              {current + 1 >= questions.length ? "See results" : "Next →"}
            </button>
          </div>
        )}
      </div>

      <AppNav />
    </div>
  );
}

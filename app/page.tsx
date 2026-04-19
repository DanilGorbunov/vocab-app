"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DEMO_WORDS = [
  { word: "Ambiguous", correct: "Неоднозначний", options: ["Неоднозначний", "Очевидний", "Простий", "Чіткий"] },
  { word: "Resilient", correct: "Стійкий", options: ["Крихкий", "Стійкий", "Повільний", "Слабкий"] },
  { word: "Eloquent", correct: "Красномовний", options: ["Мовчазний", "Грубий", "Красномовний", "Нечіткий"] },
  { word: "Diligent", correct: "Старанний", options: ["Лінивий", "Старанний", "Безтурботний", "Повільний"] },
];

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

export default function LandingPage() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);
  const [shuffledOptions] = useState(() => DEMO_WORDS.map((w) => shuffle(w.options)));

  function handleSelect(option: string) {
    if (selected) return;
    const isCorrect = option === DEMO_WORDS[current].correct;
    setSelected(option);
    setResults((r) => [...r, isCorrect]);
  }

  function handleNext() {
    if (current + 1 >= DEMO_WORDS.length) {
      setDone(true);
    } else {
      setCurrent((c) => c + 1);
      setSelected(null);
    }
  }

  const correct = results.filter(Boolean).length;

  // --- DONE SCREEN ---
  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <div className="mb-3 text-5xl">{correct >= 3 ? "🔥" : correct >= 2 ? "👍" : "📚"}</div>
        <h2 className="mb-1 text-3xl font-bold text-zinc-900">{correct}/{DEMO_WORDS.length} correct</h2>
        <p className="mb-2 text-zinc-500">
          {correct === DEMO_WORDS.length
            ? "Perfect score! You're ready for the real thing."
            : "Keep practicing — it gets easier with spaced repetition."}
        </p>
        <p className="mb-8 text-sm text-zinc-400">
          Create a free account to save progress, earn XP, and build streaks.
        </p>
        <button
          onClick={() => router.push("/login")}
          className="rounded-xl bg-zinc-900 px-8 py-3.5 text-base font-semibold text-white hover:bg-zinc-700"
        >
          Save my progress — it&apos;s free
        </button>
        <button
          onClick={() => {
            setStarted(false);
            setCurrent(0);
            setSelected(null);
            setResults([]);
            setDone(false);
          }}
          className="mt-3 text-sm text-zinc-400 hover:text-zinc-600"
        >
          Try again
        </button>
      </div>
    );
  }

  // --- QUIZ SCREEN ---
  if (started) {
    const q = DEMO_WORDS[current];
    const isCorrect = selected === q.correct;
    const progress = (current / DEMO_WORDS.length) * 100;

    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-10">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-400">VocabDrill</span>
          <span className="text-sm text-zinc-400">{current + 1} / {DEMO_WORDS.length}</span>
        </div>

        <div className="mb-8 h-1.5 w-full rounded-full bg-zinc-100">
          <div
            className="h-1.5 rounded-full bg-zinc-900 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mb-10 text-center">
          <p className="mb-1 text-xs uppercase tracking-widest text-zinc-400">Translate to Ukrainian</p>
          <h2 className="text-4xl font-bold text-zinc-900">{q.word}</h2>
        </div>

        <div className="flex flex-col gap-3">
          {shuffledOptions[current].map((option) => {
            let style = "rounded-xl border-2 px-4 py-3.5 text-sm font-medium text-left transition";
            if (selected) {
              if (option === q.correct) {
                style += " border-green-400 bg-green-50 text-green-700";
              } else if (option === selected) {
                style += " border-red-400 bg-red-50 text-red-600";
              } else {
                style += " border-zinc-100 bg-white text-zinc-400";
              }
            } else {
              style += " border-zinc-200 bg-white text-zinc-800 hover:border-zinc-400 cursor-pointer";
            }
            return (
              <button key={option} className={style} onClick={() => handleSelect(option)} disabled={!!selected}>
                {option}
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="mt-6">
            <p className={`mb-4 text-center text-sm font-medium ${isCorrect ? "text-green-600" : "text-red-500"}`}>
              {isCorrect ? "Correct! +10 XP" : `Wrong. Answer: ${q.correct}`}
            </p>
            <button
              onClick={handleNext}
              className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-medium text-white hover:bg-zinc-700"
            >
              {current + 1 >= DEMO_WORDS.length ? "See results" : "Next →"}
            </button>
          </div>
        )}
      </div>
    );
  }

  // --- LANDING SCREEN ---
  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4">
        <span className="text-lg font-bold text-zinc-900">VocabDrill</span>
        <button
          onClick={() => router.push("/login")}
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          Sign in
        </button>
      </nav>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 inline-block rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
          No account needed to try
        </div>
        <h1 className="mb-4 max-w-lg text-5xl font-bold leading-tight tracking-tight text-zinc-900">
          Learn English words that actually stick
        </h1>
        <p className="mb-10 max-w-md text-lg text-zinc-500">
          Smart quizzes, spaced repetition, XP and streaks. Try a quick demo — no sign up required.
        </p>
        <button
          onClick={() => router.push("/dictionary")}
          className="rounded-xl bg-zinc-900 px-8 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-zinc-700"
        >
          Start adding words — free →
        </button>
        <button
          onClick={() => setStarted(true)}
          className="mt-3 text-sm text-zinc-400 hover:text-zinc-600"
        >
          Or try a quick demo first ↓
        </button>
        <button
          onClick={() => router.push("/login")}
          className="mt-1 text-sm text-zinc-400 hover:text-zinc-600"
        >
          Already have an account? Sign in
        </button>
      </main>

      {/* Features */}
      <section className="mx-auto mb-20 grid max-w-3xl grid-cols-1 gap-4 px-4 sm:grid-cols-3">
        {[
          { icon: "📖", title: "Your dictionary", desc: "Add any word with translation and example" },
          { icon: "🎯", title: "Spaced repetition", desc: "Words you miss come back more often" },
          { icon: "🔥", title: "Streaks & levels", desc: "Daily streaks and XP keep you going" },
        ].map((f) => (
          <div key={f.title} className="rounded-2xl bg-white p-5 ring-1 ring-zinc-100">
            <div className="mb-2 text-2xl">{f.icon}</div>
            <h3 className="mb-1 font-semibold text-zinc-900">{f.title}</h3>
            <p className="text-sm text-zinc-500">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

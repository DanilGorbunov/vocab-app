"use client";

import { useAction, useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useGuestWords } from "@/hooks/useGuestWords";
import { useLocalTexts } from "@/hooks/useLocalTexts";
import { AppNav } from "@/components/AppNav";
import { SaveBanner } from "@/components/SaveBanner";
import { useState } from "react";

type Paragraph = { en: string; uk: string };
type AnyText = {
  _id: string;
  topic?: string;
  paragraphs: Paragraph[];
  wordsUsed: string[];
  createdAt: number;
};

function ParagraphBlock({ p }: { p: Paragraph }) {
  const [showUk, setShowUk] = useState(false);
  return (
    <div className="rounded-xl bg-zinc-50 p-4">
      <p className="text-sm leading-relaxed text-zinc-800">{p.en}</p>
      {showUk && (
        <p className="mt-2 border-t border-zinc-200 pt-2 text-sm italic leading-relaxed text-zinc-500">
          {p.uk}
        </p>
      )}
      <button
        onClick={() => setShowUk((v) => !v)}
        className="mt-2 text-xs font-medium text-zinc-400 hover:text-zinc-700"
      >
        {showUk ? "▲ Сховати переклад" : "▼ Показати переклад"}
      </button>
    </div>
  );
}

function TextCard({ text, onDelete }: { text: AnyText; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const date = new Date(text.createdAt).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100">
      {/* Header — always visible */}
      <button
        className="flex w-full items-start justify-between px-5 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-zinc-900">
            {text.topic || "Text"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-400">
            {text.paragraphs.length} paragraphs · {text.wordsUsed.join(", ")} · {date}
          </p>
        </div>
        <span className="ml-3 mt-0.5 text-zinc-400 text-sm">{open ? "▲" : "▼"}</span>
      </button>

      {/* Body */}
      {open && (
        <div className="border-t border-zinc-100 px-5 pb-5 pt-4">
          <div className="flex flex-col gap-3">
            {text.paragraphs.map((p, i) => (
              <ParagraphBlock key={i} p={p} />
            ))}
          </div>
          <button
            onClick={onDelete}
            className="mt-4 text-xs text-zinc-300 hover:text-red-400 transition"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default function TextsPage() {
  const { isAuthenticated } = useConvexAuth();
  const isGuest = !isAuthenticated;

  // Convex (auth)
  const convexTexts = useQuery(api.texts.list) as AnyText[] | undefined;
  const convexWords = useQuery(api.words.getLastN, { n: 10 });
  const generate = useAction(api.texts.generate);
  const removeConvexText = useMutation(api.texts.remove);

  // Guest (localStorage)
  const { words: guestWords } = useGuestWords();
  const { texts: localTexts, add: addLocalText, remove: removeLocalText } = useLocalTexts();

  const [topic, setTopic] = useState("");
  const [paragraphCount, setParagraphCount] = useState(4);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate() {
    setError("");
    setGenerating(true);
    try {
      if (isGuest) {
        const words = guestWords.slice(0, 10);
        if (words.length < 2) { setError("Add at least 2 words first."); return; }
        const res = await fetch("/api/generate-text", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ words, topic: topic.trim() || undefined, paragraphCount }),
        });
        let data: Record<string, unknown> = {};
        try { data = await res.json(); } catch { /* empty body */ }
        if (!res.ok) { setError((data.error as string) ?? "Something went wrong, try again."); return; }
        addLocalText({
          topic: topic.trim() || undefined,
          paragraphs: data.paragraphs as Paragraph[],
          wordsUsed: words.map((w) => w.word),
        });
      } else {
        const result = await generate({ topic: topic.trim() || undefined, paragraphCount });
        if (!result.success) setError(result.error ?? "Something went wrong");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  const wordList = isGuest ? guestWords.slice(0, 10) : (convexWords ?? []);
  const hasEnoughWords = wordList.length >= 2;

  const texts: AnyText[] = isGuest
    ? localTexts.map((t) => ({ ...t, _id: t.id }))
    : (convexTexts ?? []);

  return (
    <div className={`min-h-screen bg-[#f7f7f5] ${isGuest ? "pt-12" : ""}`}>
      {isGuest && <SaveBanner count={guestWords.length} />}

      <div className="mx-auto max-w-2xl px-4 pb-28 pt-6">
        <h1 className="mb-1 text-2xl font-bold text-zinc-900">Texts</h1>
        <p className="mb-6 text-sm text-zinc-500">
          Generate a reading text from your last 10 words.
        </p>

        {/* Generator */}
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-100">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Words to use
          </p>
          <p className="mb-4 text-sm font-medium text-zinc-900">
            {wordList.length > 0 ? wordList.map((w) => w.word).join(", ") : "—"}
          </p>

          <div className="flex flex-col gap-3">
            <input
              placeholder="Topic / theme (optional) — e.g. travel, AI, sport"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-zinc-400 focus:bg-white"
            />
            <div className="flex items-center gap-3">
              <label className="whitespace-nowrap text-sm text-zinc-500">Paragraphs:</label>
              <input
                type="range" min={2} max={10} value={paragraphCount}
                onChange={(e) => setParagraphCount(Number(e.target.value))}
                className="flex-1 accent-zinc-900"
              />
              <span className="w-5 text-center text-sm font-bold text-zinc-800">{paragraphCount}</span>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
            {!hasEnoughWords && (
              <p className="text-sm text-amber-600">Add at least 2 words first.</p>
            )}

            <button
              onClick={handleGenerate}
              disabled={generating || !hasEnoughWords}
              className="flex items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 transition"
            >
              {generating ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Generating…</>
              ) : "✍️ Generate text"}
            </button>
          </div>
        </div>

        {/* Texts list */}
        {!isGuest && texts === undefined && (
          <p className="text-center text-sm text-zinc-400">Loading…</p>
        )}
        {texts.length === 0 && (
          <div className="py-12 text-center">
            <div className="mb-3 text-4xl">✍️</div>
            <p className="text-sm text-zinc-400">No texts yet. Generate your first one above.</p>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {texts.map((t) => (
            <TextCard
              key={t._id}
              text={t}
              onDelete={() =>
                isGuest
                  ? removeLocalText(t._id)
                  : removeConvexText({ textId: t._id as Parameters<typeof removeConvexText>[0]["textId"] })
              }
            />
          ))}
        </div>
      </div>

      <AppNav />
    </div>
  );
}

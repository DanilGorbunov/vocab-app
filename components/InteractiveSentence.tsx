"use client";

import { useState, useRef } from "react";
import { SpeakButton } from "./SpeakButton";

export type LearnedWordInfo = {
  translation: string;
  status: "new" | "learning" | "mastered";
};

const STATUS_CLS: Record<string, string> = {
  new:      "decoration-blue-400   decoration-2",
  learning: "decoration-amber-400  decoration-2",
  mastered: "decoration-emerald-400 decoration-2",
};

interface WordTooltipProps {
  token: string;
  onAdd?: (word: string, translation: string) => boolean;
  learned?: LearnedWordInfo; // pre-filled from vocabulary
}

function WordTooltip({ token, onAdd, learned }: WordTooltipProps) {
  const clean = token.replace(/^[^a-zA-Z'-]+|[^a-zA-Z'-]+$/g, "");

  // Pre-fill translation from vocabulary if available
  const [trans, setTrans] = useState<string | null>(learned?.translation ?? null);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<"added" | "duplicate" | null>(null);
  const fetched = useRef(!!learned);
  const transRef = useRef<string | null>(learned?.translation ?? null);

  if (clean.length < 2) return <span>{token}</span>;

  const fetchTranslation = async (): Promise<string | null> => {
    if (fetched.current) return transRef.current;
    fetched.current = true;
    setLoading(true);
    try {
      const r = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ word: clean }),
      });
      const d = await r.json();
      if (d.translation) {
        transRef.current = d.translation;
        setTrans(d.translation);
        return d.translation;
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
    return null;
  };

  const handleClick = async () => {
    if (!onAdd) return;
    const translation = transRef.current ?? (await fetchTranslation());
    if (translation) {
      const wasAdded = onAdd(clean, translation);
      setAdded(wasAdded ? "added" : "duplicate");
      setTimeout(() => setAdded(null), 2000);
    }
  };

  // Underline style: vocabulary status colour or default dotted
  const underlineCls = learned
    ? `underline ${STATUS_CLS[learned.status] ?? STATUS_CLS.new} cursor-pointer`
    : "underline decoration-dotted decoration-zinc-300 cursor-pointer";

  const colorCls =
    added === "added"
      ? "text-emerald-600"
      : added === "duplicate"
      ? "text-zinc-400"
      : "";

  return (
    <span className="relative group/w inline-block">
      <span
        className={`${underlineCls} ${colorCls} hover:text-zinc-900 transition-colors`}
        onMouseEnter={fetchTranslation}
        onClick={handleClick}
      >
        {token}
      </span>

      {/* Invisible bridge between word and tooltip */}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 w-full h-2 hidden group-hover/w:block" />

      {/* Tooltip */}
      <span className="pointer-events-auto absolute bottom-[calc(100%+8px)] left-1/2 z-30 -translate-x-1/2 hidden group-hover/w:flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-xl">
        {added === "added" ? (
          <span className="text-emerald-400">✓ Added</span>
        ) : added === "duplicate" ? (
          <span className="text-zinc-400">Already in list</span>
        ) : loading ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
        ) : (
          <>
            <span>{trans ?? "…"}</span>
            {learned && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                learned.status === "mastered" ? "bg-emerald-700 text-emerald-200"
                : learned.status === "learning" ? "bg-amber-700 text-amber-200"
                : "bg-blue-700 text-blue-200"
              }`}>
                {learned.status}
              </span>
            )}
          </>
        )}
        <span className="border-l border-zinc-700 pl-1.5">
          <SpeakButton text={clean} className="text-zinc-400 hover:text-white" />
        </span>
        {/* Arrow */}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
      </span>
    </span>
  );
}

interface Props {
  sentence: string;
  onAdd?: (word: string, translation: string) => boolean;
  learnedWords?: Map<string, LearnedWordInfo>; // lowercased word → info
}

export function InteractiveSentence({ sentence, onAdd, learnedWords }: Props) {
  const tokens = sentence.match(/\S+|\s+/g) ?? [];
  return (
    <>
      {tokens.map((t, i) => {
        if (/^\s+$/.test(t)) return <span key={i}>{t}</span>;
        const clean = t.replace(/^[^a-zA-Z'-]+|[^a-zA-Z'-]+$/g, "").toLowerCase();
        const learned = learnedWords?.get(clean);
        return (
          <WordTooltip
            key={`${t}-${i}`}
            token={t}
            onAdd={onAdd}
            learned={learned}
          />
        );
      })}
    </>
  );
}

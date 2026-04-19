"use client";

import { useState, useRef } from "react";
import { SpeakButton } from "./SpeakButton";

function WordTooltip({ token }: { token: string }) {
  // Strip leading/trailing punctuation to get the clean word
  const clean = token.replace(/^[^a-zA-Z'-]+|[^a-zA-Z'-]+$/g, "");
  const [trans, setTrans] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fetched = useRef(false);

  // Skip punctuation-only tokens or single chars
  if (clean.length < 2) return <span>{token}</span>;

  const handleHover = async () => {
    if (fetched.current) return;
    fetched.current = true;
    setLoading(true);
    try {
      const r = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ word: clean }),
      });
      const d = await r.json();
      if (d.translation) setTrans(d.translation);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className="relative group/w inline-block">
      <span
        className="underline decoration-dotted decoration-zinc-300 cursor-default hover:text-zinc-900 transition-colors"
        onMouseEnter={handleHover}
      >
        {token}
      </span>

      {/* Invisible bridge — fills the gap between word and tooltip so hover doesn't break */}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 w-full h-2 hidden group-hover/w:block" />

      {/* Tooltip */}
      <span className="pointer-events-auto absolute bottom-[calc(100%+8px)] left-1/2 z-30 -translate-x-1/2 hidden group-hover/w:flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-xl">
        {loading ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
        ) : (
          <span>{trans ?? "…"}</span>
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

export function InteractiveSentence({ sentence }: { sentence: string }) {
  const tokens = sentence.match(/\S+|\s+/g) ?? [];
  return (
    <>
      {tokens.map((t, i) =>
        /^\s+$/.test(t) ? (
          <span key={i}>{t}</span>
        ) : (
          <WordTooltip key={`${t}-${i}`} token={t} />
        )
      )}
    </>
  );
}

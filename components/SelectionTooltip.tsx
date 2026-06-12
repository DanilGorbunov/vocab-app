"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { SpeakButton } from "./SpeakButton";

interface TooltipState {
  text: string;
  x: number;  // viewport-relative (for fixed positioning)
  y: number;
  trans: string | null;
  loading: boolean;
}

interface Props {
  children: React.ReactNode;
  onAdd?: (word: string, translation: string) => boolean;
}

export function SelectionTooltip({ children, onAdd }: Props) {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const [status, setStatus] = useState<"added" | "duplicate" | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const handleSelection = useCallback(() => {
    setTimeout(async () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || text.length < 2) { setTip(null); return; }

      const range = sel!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      // Use fixed positioning — x/y are pure viewport coords
      const x = Math.min(rect.left + rect.width / 2, window.innerWidth - 160);
      const y = rect.top; // above selection

      setTip({ text, x, y, trans: null, loading: true });
      setStatus(null);

      try {
        const r = await fetch("/api/translate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ word: text }),
        });
        const d = await r.json();
        setTip((prev) =>
          prev && prev.text === text
            ? { ...prev, trans: d.translation ?? null, loading: false }
            : prev
        );
      } catch {
        setTip((prev) => (prev ? { ...prev, loading: false } : null));
      }
    }, 60);
  }, []);

  // Mouse support
  const handleMouseUp = useCallback(() => handleSelection(), [handleSelection]);

  // Touch support
  const handleTouchEnd = useCallback(() => handleSelection(), [handleSelection]);

  // Close when tapping outside tooltip
  useEffect(() => {
    function onPointerDown(e: MouseEvent | TouchEvent) {
      const target = "touches" in e ? e.touches[0]?.target : (e as MouseEvent).target;
      if (tipRef.current && tipRef.current.contains(target as Node)) return;
      setTip(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown as EventListener);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown as EventListener);
    };
  }, []);

  function handleAdd() {
    if (!tip || !onAdd) return;
    const trans = tip.trans ?? "";
    const ok = onAdd(tip.text, trans);
    setStatus(ok ? "added" : "duplicate");
    if (ok) {
      setTimeout(() => { setTip(null); setStatus(null); }, 1200);
    } else {
      setTimeout(() => setStatus(null), 1800);
    }
  }

  return (
    <div onMouseUp={handleMouseUp} onTouchEnd={handleTouchEnd} className="relative">
      {children}

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
          ) : status === "added" ? (
            <span className="text-emerald-400">✓ Added!</span>
          ) : status === "duplicate" ? (
            <span className="text-zinc-400">Already in your list</span>
          ) : (
            <>
              <span className="max-w-[180px] truncate">{tip.trans ?? "…"}</span>
              {tip.trans && (
                <span className="border-l border-zinc-700 pl-1.5">
                  <SpeakButton text={tip.text} className="text-zinc-400 hover:text-white" />
                </span>
              )}
              {onAdd && tip.trans !== null && (
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleAdd}
                  className="border-l border-zinc-700 pl-1.5 text-emerald-400 hover:text-emerald-300 font-bold text-sm leading-none"
                  title="Add to vocabulary"
                >
                  + Add
                </button>
              )}
            </>
          )}

          {!tip.loading && !status && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setTip(null)}
              className="border-l border-zinc-700 pl-1.5 text-zinc-500 hover:text-white"
            >
              ×
            </button>
          )}

          {/* Arrow */}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
        </div>
      )}
    </div>
  );
}

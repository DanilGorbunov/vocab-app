"use client";

import { useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type GuestWord = {
  id: string;
  word: string;
  translation: string;
  example?: string;
  status: "new" | "learning" | "mastered";
  xp: number;
};

export default function MigratePage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();
  const addWord = useMutation(api.words.add);

  const [localWords, setLocalWords] = useState<GuestWord[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "empty">("idle");
  const [imported, setImported] = useState(0);
  const [skipped, setSkipped] = useState(0);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vocab_guest_words");
      if (raw) {
        const parsed: GuestWord[] = JSON.parse(raw);
        setLocalWords(Array.isArray(parsed) ? parsed : []);
      }
    } catch {
      setLocalWords([]);
    }
  }, []);

  async function handleMigrate() {
    if (localWords.length === 0) { setStatus("empty"); return; }
    setStatus("running");
    let ok = 0; let skip = 0;
    for (const w of localWords) {
      try {
        await addWord({ word: w.word, translation: w.translation, example: w.example || undefined });
        ok++;
      } catch {
        skip++; // duplicate or error — skip
      }
    }
    localStorage.removeItem("vocab_guest_words");
    setImported(ok);
    setSkipped(skip);
    setStatus("done");
  }

  if (isLoading || !isAuthenticated) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
        <h1 className="mb-2 text-xl font-bold text-zinc-900">Import local words</h1>
        <p className="mb-6 text-sm text-zinc-500">Transfer words saved in this browser to your Convex account.</p>

        {status === "idle" && (
          <>
            {localWords.length === 0 ? (
              <p className="mb-6 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                No local words found in this browser.
              </p>
            ) : (
              <div className="mb-6">
                <p className="mb-3 text-sm font-medium text-zinc-700">
                  Found <span className="font-bold text-zinc-900">{localWords.length}</span> word{localWords.length !== 1 ? "s" : ""} in localStorage:
                </p>
                <ul className="max-h-64 overflow-y-auto rounded-xl bg-zinc-50 px-4 py-3 text-sm">
                  {localWords.map((w) => (
                    <li key={w.id} className="flex items-center gap-2 py-1 border-b border-zinc-100 last:border-0">
                      <span className="font-medium text-zinc-800">{w.word}</span>
                      <span className="text-zinc-300">—</span>
                      <span className="text-zinc-500">{w.translation}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {localWords.length > 0 && (
                <button
                  onClick={handleMigrate}
                  className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white hover:bg-zinc-700"
                >
                  Import {localWords.length} word{localWords.length !== 1 ? "s" : ""} →
                </button>
              )}
              <button
                onClick={() => router.push("/dictionary")}
                className="w-full rounded-xl border border-zinc-200 py-3 text-sm text-zinc-500 hover:bg-zinc-50"
              >
                Go to Dictionary
              </button>
            </div>
          </>
        )}

        {status === "running" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-800" />
            <p className="text-sm text-zinc-500">Importing words…</p>
          </div>
        )}

        {status === "done" && (
          <>
            <div className="mb-6 rounded-xl bg-emerald-50 px-4 py-4 text-center">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-sm font-semibold text-emerald-800">
                {imported} word{imported !== 1 ? "s" : ""} imported
              </p>
              {skipped > 0 && (
                <p className="mt-1 text-xs text-zinc-400">{skipped} skipped (duplicates)</p>
              )}
            </div>
            <button
              onClick={() => router.push("/dictionary")}
              className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white hover:bg-zinc-700"
            >
              Go to Dictionary →
            </button>
          </>
        )}

        {status === "empty" && (
          <p className="text-sm text-zinc-500">Nothing to import.</p>
        )}
      </div>
    </div>
  );
}

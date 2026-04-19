"use client";

import { useState, useEffect, useCallback } from "react";

export type LocalText = {
  id: string;
  topic?: string;
  paragraphs: { en: string; uk: string }[];
  wordsUsed: string[];
  createdAt: number;
};

const KEY = "vocab_local_texts";

function load(): LocalText[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(texts: LocalText[]) {
  localStorage.setItem(KEY, JSON.stringify(texts));
}

export function useLocalTexts() {
  const [texts, setTexts] = useState<LocalText[]>([]);

  useEffect(() => {
    setTexts(load());
  }, []);

  const add = useCallback((text: Omit<LocalText, "id" | "createdAt">) => {
    const newText: LocalText = {
      ...text,
      id: `local-${Date.now()}`,
      createdAt: Date.now(),
    };
    setTexts((prev) => {
      const updated = [newText, ...prev];
      save(updated);
      return updated;
    });
    return newText;
  }, []);

  const remove = useCallback((id: string) => {
    setTexts((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      save(updated);
      return updated;
    });
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(KEY);
    setTexts([]);
  }, []);

  return { texts, add, remove, clear };
}

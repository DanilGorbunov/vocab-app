"use client";

import { useState, useEffect, useCallback } from "react";

export type GuestWord = {
  id: string;
  word: string;
  translation: string;
  example?: string;
  status: "new" | "learning" | "mastered";
  xp: number;
  createdAt: number;
};

const KEY = "vocab_guest_words";

function load(): GuestWord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(words: GuestWord[]) {
  localStorage.setItem(KEY, JSON.stringify(words));
}

export function useGuestWords() {
  const [words, setWords] = useState<GuestWord[]>([]);

  useEffect(() => {
    setWords(load());
  }, []);

  const add = useCallback((word: string, translation: string, example?: string) => {
    const newWord: GuestWord = {
      id: `${Date.now()}-${Math.random()}`,
      word,
      translation,
      example,
      status: "new",
      xp: 0,
      createdAt: Date.now(),
    };
    setWords((prev) => {
      const updated = [newWord, ...prev];
      save(updated);
      return updated;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setWords((prev) => {
      const updated = prev.filter((w) => w.id !== id);
      save(updated);
      return updated;
    });
  }, []);

  const updateWord = useCallback((id: string, patch: Partial<GuestWord>) => {
    setWords((prev) => {
      const updated = prev.map((w) => (w.id === id ? { ...w, ...patch } : w));
      save(updated);
      return updated;
    });
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(KEY);
    setWords([]);
  }, []);

  return { words, add, remove, updateWord, clear };
}

export function getGuestWords(): GuestWord[] {
  return load();
}

"use client";

import { useCallback, useState } from "react";

interface Props {
  text: string;
  className?: string;
}

export function SpeakButton({ text, className = "" }: Props) {
  const [speaking, setSpeaking] = useState(false);

  const speak = useCallback(() => {
    if (!text || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = "en-US";
    utt.rate = 0.9;

    // Prefer a natural English voice if available
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(
      (v) => v.lang.startsWith("en") && v.localService
    ) ?? voices.find((v) => v.lang.startsWith("en"));
    if (enVoice) utt.voice = enVoice;

    utt.onstart = () => setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utt);
  }, [text]);

  return (
    <button
      type="button"
      onClick={speak}
      title={`Pronounce "${text}"`}
      className={`flex items-center justify-center rounded-lg transition ${
        speaking
          ? "text-zinc-900 animate-pulse"
          : "text-zinc-300 hover:text-zinc-600"
      } ${className}`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M10 3.75a.75.75 0 0 0-1.264-.546L4.703 7H3.167a.75.75 0 0 0-.7.48A6.985 6.985 0 0 0 2 10c0 .887.165 1.737.468 2.52.111.29.39.48.7.48h1.535l4.033 3.796A.75.75 0 0 0 10 16.25V3.75ZM15.95 5.05a.75.75 0 0 0-1.06 1.061 5.5 5.5 0 0 1 0 7.778.75.75 0 0 0 1.06 1.06 7 7 0 0 0 0-9.899Z" />
        <path d="M13.829 7.172a.75.75 0 0 0-1.061 1.06 2.5 2.5 0 0 1 0 3.536.75.75 0 0 0 1.06 1.06 4 4 0 0 0 0-5.656Z" />
      </svg>
    </button>
  );
}

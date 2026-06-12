"use client";

import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useGuestWords } from "@/hooks/useGuestWords";
import { AppNav } from "@/components/AppNav";
import { SaveBanner } from "@/components/SaveBanner";
import { useState, useRef, useEffect, useCallback } from "react";

type Message = { role: "user" | "assistant"; content: string };

// Render *word* as highlighted bold spans
function MessageText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("*") && part.endsWith("*") ? (
          <strong key={i} className="font-semibold text-emerald-600">
            {part.slice(1, -1)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function ChatPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const isGuest = !isLoading && !isAuthenticated;

  const convexWords = useQuery(api.words.list);
  const { words: guestWords } = useGuestWords();

  const words = isGuest
    ? guestWords.map((w) => ({ word: w.word, translation: w.translation }))
    : (convexWords ?? []).map((w) => ({ word: w.word, translation: w.translation }));

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isVoice, setIsVoice] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setVoiceSupported(
      typeof window !== "undefined" &&
        ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    );
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const plain = text.replace(/\*([^*]+)\*/g, "$1");
    const utt = new SpeechSynthesisUtterance(plain);
    utt.lang = "en-US";
    utt.rate = 0.95;
    window.speechSynthesis.speak(utt);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const newMessages: Message[] = [
        ...messages,
        { role: "user", content: trimmed },
      ];
      setMessages(newMessages);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: newMessages, words }),
        });
        const data = await res.json();
        const reply = data.content ?? "Sorry, something went wrong.";
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
        if (isVoice) speak(reply);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Connection error. Please try again." },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, words, isVoice, speak]
  );

  function startListening() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const rec = new SpeechRecognition();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => setIsListening(true);
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript;
      sendMessage(transcript);
    };

    recognitionRef.current = rec;
    rec.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  if (isLoading) return null;

  const placeholder =
    words.length > 0
      ? `Chat — GPT will use your ${words.length} words…`
      : "Chat in English…";

  return (
    <div className={`flex min-h-screen flex-col bg-[#f7f7f5] ${isGuest ? "pt-12" : ""}`}>
      {isGuest && <SaveBanner count={guestWords.length} />}

      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-zinc-100 bg-white/90 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-zinc-900">Chat with GPT</h1>
            {words.length > 0 && (
              <p className="text-xs text-zinc-400">Using {words.length} vocabulary words</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {voiceSupported && (
              <button
                onClick={() => setIsVoice((v) => !v)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  isVoice
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                }`}
              >
                {isVoice ? "🎤 Voice" : "⌨️ Text"}
              </button>
            )}
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="text-xs text-zinc-400 hover:text-zinc-700"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-lg flex flex-col gap-3">
          {messages.length === 0 && (
            <div className="py-12 text-center">
              <div className="mb-3 text-4xl">💬</div>
              <p className="text-sm font-medium text-zinc-700">Start a conversation</p>
              <p className="mt-1 text-xs text-zinc-400">
                {words.length > 0
                  ? "GPT will naturally use your vocabulary words"
                  : "Add words to your dictionary to have GPT use them in conversation"}
              </p>
              {/* Starter prompts */}
              <div className="mt-6 flex flex-col gap-2">
                {[
                  "Tell me about your day",
                  "Let's talk about travel",
                  "What's something interesting you know?",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50 transition text-left"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-zinc-900 text-white rounded-br-sm"
                    : "bg-white text-zinc-800 shadow-sm ring-1 ring-zinc-100 rounded-bl-sm"
                }`}
              >
                {m.role === "assistant" ? (
                  <MessageText text={m.content} />
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm ring-1 ring-zinc-100 flex gap-1">
                <span className="h-2 w-2 rounded-full bg-zinc-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-2 w-2 rounded-full bg-zinc-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-2 w-2 rounded-full bg-zinc-300 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="sticky bottom-16 z-10 border-t border-zinc-100 bg-white/95 backdrop-blur px-4 py-3">
        <div className="mx-auto max-w-lg">
          {isVoice ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <button
                onMouseDown={startListening}
                onMouseUp={stopListening}
                onTouchStart={startListening}
                onTouchEnd={stopListening}
                disabled={loading}
                className={`h-16 w-16 rounded-full text-2xl transition-all shadow-md ${
                  isListening
                    ? "bg-red-500 text-white scale-110 shadow-red-200"
                    : "bg-zinc-900 text-white hover:bg-zinc-700"
                } disabled:opacity-50`}
              >
                🎤
              </button>
              <p className="text-xs text-zinc-400">
                {isListening ? "Listening… release to send" : "Hold to speak"}
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
              className="flex gap-2"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={placeholder}
                disabled={loading}
                className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none focus:border-zinc-400 focus:bg-white disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 transition"
              >
                Send
              </button>
            </form>
          )}
        </div>
      </div>

      <AppNav />
    </div>
  );
}

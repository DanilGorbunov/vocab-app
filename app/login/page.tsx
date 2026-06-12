"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { getGuestWords } from "@/hooks/useGuestWords";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const bulkAdd = useMutation(api.words.bulkAdd);
  const router = useRouter();

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestCount, setGuestCount] = useState(0);

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/dictionary");
  }, [isAuthenticated, isLoading, router]);

  // Read localStorage only after mount to avoid SSR hydration mismatch
  useEffect(() => {
    const count = getGuestWords().length;
    setGuestCount(count);
    if (count > 0) setIsRegister(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn("password", {
        email,
        password,
        flow: isRegister ? "signUp" : "signIn",
      });

      // Migrate guest words → Convex
      const guestWords = getGuestWords();
      if (guestWords.length > 0) {
        await bulkAdd({
          words: guestWords.map((w) => ({
            word: w.word,
            translation: w.translation,
            example: w.example,
          })),
        });
        localStorage.removeItem("vocab_guest_words");
      }

      router.push("/dictionary");
    } catch {
      setError(isRegister ? "Registration failed. Try again." : "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-3xl font-bold text-zinc-900">VocabDrill</h1>
        <p className="mb-8 text-center text-sm text-zinc-500">English vocabulary trainer</p>

        {guestCount > 0 && (
          <div className="mb-4 rounded-xl bg-zinc-900 px-4 py-3 text-center text-sm text-white">
            💾 You have <strong>{guestCount} word{guestCount !== 1 ? "s" : ""}</strong> saved locally — they&apos;ll be added to your account automatically.
          </div>
        )}

        <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
          <h2 className="mb-6 text-lg font-semibold text-zinc-800">
            {isRegister ? "Create account" : "Sign in"}
          </h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isRegister ? "new-password" : "current-password"}
              className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50"
            >
              {loading
                ? (guestCount > 0 ? `Saving ${guestCount} words…` : "…")
                : isRegister ? "Create account" : "Sign in"}
            </button>
          </form>

          <button
            onClick={() => { setIsRegister(!isRegister); setError(""); }}
            className="mt-4 w-full text-center text-sm text-zinc-500 hover:text-zinc-800"
          >
            {isRegister ? "Already have an account? Sign in" : "No account? Register"}
          </button>
        </div>
      </div>
    </div>
  );
}

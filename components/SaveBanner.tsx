"use client";

import { useRouter } from "next/navigation";

export function SaveBanner({ count }: { count: number }) {
  const router = useRouter();
  if (count === 0) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between gap-3 bg-zinc-900 px-4 py-2.5">
      <p className="text-xs text-zinc-300">
        <span className="font-semibold text-white">{count} word{count !== 1 ? "s" : ""}</span> saved locally — sign up to keep them forever
      </p>
      <button
        onClick={() => router.push("/login")}
        className="shrink-0 rounded-md bg-white px-3 py-1 text-xs font-semibold text-zinc-900 hover:bg-zinc-100 transition"
      >
        Sign up free
      </button>
    </div>
  );
}

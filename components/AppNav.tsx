"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dictionary", label: "Words",  icon: "📖" },
  { href: "/training",   label: "Train",  icon: "🎯" },
  { href: "/texts",      label: "Texts",  icon: "✍️"  },
];

export function AppNav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 bg-white/90 backdrop-blur border-t border-zinc-100">
      <div className="mx-auto flex max-w-lg">
        {TABS.map((t) => {
          const active = path.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                active ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-600"
              }`}
            >
              <span className={`text-xl leading-none transition-transform ${active ? "scale-110" : "scale-100"}`}>
                {t.icon}
              </span>
              <span>{t.label}</span>
              {active && <span className="h-0.5 w-5 rounded-full bg-zinc-900" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

# VocabApp — English Learning App

## Product Vision
Personal English vocabulary learning app with:
1. Word dictionary (add word + translation + example)
2. Training with multiple choice answers, XP system, streaks, gamification
3. AI-generated reading texts from user's words, with per-paragraph translation toggle

---

## Stack

### Frontend
- Next.js 14 (App Router), TypeScript, Tailwind CSS
- Deployed on Vercel

### Backend / Database / Real-time
- Convex — all backend logic lives in /convex folder
- Convex handles: database, serverless functions, real-time subscriptions, auth
- NO separate API server — everything goes through Convex mutations/queries/actions

### AI
- Claude API (Anthropic) — called from Convex actions to generate texts from words
- Model: claude-sonnet-4-20250514

### Auth
- Convex Auth (built-in)

---

## Project Structure

```
vocab-app/
├── app/                    # Next.js pages
│   ├── (auth)/             # Login / Register
│   ├── dictionary/         # Word list + add word
│   ├── training/           # Quiz / training session
│   └── texts/              # AI-generated reading texts
├── convex/
│   ├── schema.ts           # DB schema — single source of truth
│   ├── words.ts            # Word CRUD mutations/queries
│   ├── training.ts         # Training logic, XP, streak
│   ├── texts.ts            # Text generation via Claude API
│   └── auth.ts             # Auth config
├── components/             # Shared UI components
└── CLAUDE.md
```

---

## Convex Schema (reference)

```typescript
// convex/schema.ts
words: {
  userId: string
  word: string
  translation: string
  example?: string
  status: "new" | "learning" | "mastered"
  xp: number
  lastPracticed?: number
  nextReview?: number  // spaced repetition timestamp
}

trainingSession: {
  userId: string
  wordId: string
  correct: boolean
  timestamp: number
}

userStats: {
  userId: string
  totalXP: number
  streak: number
  lastActiveDate: string
  level: number
}

generatedTexts: {
  userId: string
  text: string
  paragraphs: Array<{
    en: string
    uk: string
  }>
  wordsUsed: string[]
  createdAt: number
}
```

---

## Core Rules

1. **All DB access through Convex** — no direct SQL, no REST endpoints
2. **Mutations for writes, queries for reads, actions for external API calls** (Claude)
3. **Spaced repetition logic** — words answered wrong appear more often
4. **Never hardcode API keys** — use Convex environment variables for ANTHROPIC_API_KEY
5. **TypeScript strict** — all Convex functions must be fully typed

---

## Gamification Logic

- Correct answer: +10 XP
- Wrong answer: -5 XP (min 0)
- Streak: consecutive days with at least 1 training session
- Levels: 0-100 XP = Beginner, 100-500 = Elementary, 500-2000 = Intermediate, 2000+ = Advanced
- Training session: 10 words, 4 multiple choice options per word

---

## Text Generation Prompt (Claude)

When generating a text from user words:
- Use ALL provided words naturally in the text
- 3-5 paragraphs, B1-B2 English level
- Return JSON: { paragraphs: [{ en: string, uk: string }] }
- Ukrainian translation should be natural, not literal

---

## Dev Workflow

```bash
npx convex dev    # terminal 1 — Convex backend
npm run dev       # terminal 2 — Next.js frontend
```

Vercel auto-deploys on push to main.
Convex auto-deploys on `npx convex deploy`.

---

## Business Context
- Solo project, speed over perfection
- First goal: working training loop (dictionary + quiz)
- Second goal: AI text generation
- Future: mobile app (React Native + Convex — same backend)

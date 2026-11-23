# AI Phone Tutor

A voice tutor that teaches older, first-time smartphone users in **Telugu** (primary), **Hindi** and **English**. The plan is in [docs/ai-tutor-plan.md](docs/ai-tutor-plan.md).

This is milestone **M0: trilingual voice loop**: onboarding, a live voice tutor in three languages, barge-in, the Ask button, and an avatar whose mouth moves with the tutor's voice.

## Layout

| Path | What it is |
| --- | --- |
| `packages/shared` | Language registry (`src/languages/`), lesson schema and validator, screen manifest, data-channel protocol |
| `apps/agent` | LiveKit Agents worker: Sarvam speech-to-text and voice, Claude for live answers, scam-help safety path |
| `apps/web` | Next.js PWA: language picker, phone-language step, mic check, consent, tutor screen |
| `content/lessons` | Lesson JSON (one structure plus a text pack per language) |

## Setup

You need Node 20+, and accounts for [LiveKit Cloud](https://cloud.livekit.io) (India region), [Sarvam AI](https://dashboard.sarvam.ai) and [Anthropic](https://console.anthropic.com).

```powershell
npm install
```

```powershell
Copy-Item apps/agent/.env.example apps/agent/.env
```

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
```

Fill in the keys in both files, then run the agent and the web app in two terminals:

```powershell
npm run download-files -w @ai-tutor/agent
```

```powershell
npm run dev:agent
```

```powershell
npm run dev:web
```

Open http://localhost:3000. To test on a phone, the page must be served over HTTPS for the mic to work (for example with a tunnel such as `ngrok http 3000`).

## Cost dashboard

Open http://localhost:3000/admin and sign in with `ADMIN_PASSWORD` from `apps/web/.env.local`.

- The agent writes one record per session (usage and estimated ₹ cost) to `data/usage.jsonl`, with a snapshot every minute while a session is live.
- Prices live in `packages/shared/src/costs.ts`. Update them, and `PRICES_CHECKED_ON`, when providers change prices.
- `SARVAM_CREDIT_INR` and `MONTHLY_BUDGET_INR` in `apps/web/.env.local` drive the two meters.
- These are estimates. Check your Sarvam and LiveKit dashboards for the actual bills.
- The log file only works while the agent and web app run on the same machine. Moving it to Postgres is part of M4.

## Checks

```powershell
npm test
```

```powershell
npm run typecheck
```

```powershell
npm run validate:lessons
```

## Adding a language

1. Add `packages/shared/src/languages/<code>.ts` and register it in `languages/index.ts` (add the code to `LanguageCode`).
2. Add its UI strings in `apps/web/lib/strings.ts` (TypeScript flags missing keys).
3. Add a locale pack to every lesson in `content/lessons/`.
4. Pass the speech test with 5+ elderly speakers before setting `status: "launch"`.

## Not built yet

Lesson player and practice screens (M2), cached lesson audio, Redis caps and kill switch, phone OTP, Razorpay, Langfuse/PostHog (M4). See the milestones in the plan.

<p align="center">
  <img src="docs/assets/logo-lockup.svg" alt="AutoFinance" width="380" height="81" />
</p>

<p align="center">
  <img src="https://flagcdn.com/20x15/br.png" alt="BR" width="20" height="15" /> <a href="README.md">Português</a> | <img src="https://flagcdn.com/20x15/us.png" alt="US" width="20" height="15" /> English | <img src="https://flagcdn.com/20x15/es.png" alt="ES" width="20" height="15" /> <a href="README.es.md">Español</a>
</p>

<p align="center">
  <a href="https://github.com/rasecdev/AutoFinance/actions/workflows/ci.yml"><img src="https://github.com/rasecdev/AutoFinance/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white" alt="Node" />
  <img src="https://img.shields.io/badge/tests-vitest-6E9F18?logo=vitest&logoColor=white" alt="Vitest" />
</p>

Personal finance bot, on Telegram and WhatsApp. You describe what happened in natural language — text, voice, photo, PDF, spreadsheet, email — and the AI interprets it and decides which action to take; every financial calculation is always deterministic code, never the AI "guessing" a number. The backend is the source of truth: history and financial data live in your own database, never in the AI provider.

<p align="center">
  <img src="docs/assets/demo-hero.en.svg" alt="Demo: user logs an expense in natural language and the bot replies confirming account, card and category" width="480" />
</p>

## Why it exists

Besides solving a real problem (financial control without the friction of opening an app and filling out a form), this project is publicly documented as a case study of applied AI usage — architecture decisions, an in-house benchmark, and the reasoning behind every choice (including when research points to *not* doing something) are kept as a living log in [PROGRESSO.md](PROGRESSO.md) (in Portuguese). Full design in [PLANO.md](PLANO.md), product summary in [PRD.md](PRD.md) (also in Portuguese).

## How it works

The AI never calculates money nor has direct database access — it picks which function (*tool*) to call from a fixed JSON schema, and the backend runs the actual calculation. Classic function calling, five steps:

<p align="center">
  <img src="docs/assets/demo-function-calling.en.svg" alt="Animated diagram: user message, JSON schema of available functions, argument extraction and tool call assembly, deterministic backend execution with return value, and final response formatted by the AI" width="480" />
</p>

1. **Message** — user writes in natural language.
2. **Schemas** — the AI receives the JSON schema of every registered function (tool).
3. **Tool call** — the model extracts the arguments from the message and assembles the chosen function call.
4. **Execution** — the backend runs the function (deterministic code) and returns the result.
5. **Response** — the AI formats the return value into a readable reply for the user.

High-impact actions (paying down a debt, deleting a transaction, renegotiating) always require explicit confirmation before executing — the AI never acts on real uncertainty.

## Cache

Two independent layers, each solving a different problem:

- **Native provider prompt caching** — keyed by content + model by OpenRouter/Anthropic itself, no extra logic in the bot; reduces token cost on long conversations with no risk of cross-model contamination.
- **Categorization cache** (`cache_categorizacao`) — normalized description (trim + lowercase + accent removal) → category. Once a description has been seen before, the backend resolves the category deterministically and **authoritatively** — even if the AI suggests a different one in the same call, the cached category wins. Correcting the category on an edit overwrites the cache with `origem: usuario`; from then on the AI never "re-guesses" that description again.

## Features

**Day-to-day logging**
- Log an expense/income just by describing it in text, voice, photo or PDF, no form.
- Import a bank statement from a spreadsheet (`.xlsx`), with confirmation before saving.
- Transfer between accounts, with a fee when the bank charges one.
- Edit or delete a wrong entry (deletion is always logical/soft).

**Debts and credit cards**
- Loan/financing/payroll loan with installments generated automatically.
- Real simulation and paydown (deterministic Price/SAC amortization calculation).
- Renegotiate without losing the original debt's history.

**Integrations**
- Email reading (card invoices and installment slips) with confirmation before saving, and due dates created in Google Calendar without duplicates.
- Bank aggregation via Open Finance (Pluggy): statements and balances synced without double-logging what was already entered by chat.

**Channels and languages**
- Telegram and WhatsApp active at the same time: proactive messages (reports, alerts), AI chat and commands on both. Media (photo/PDF/audio/spreadsheet) is Telegram-only for now.
- Portuguese, English and Spanish, switchable with `/idioma`.

**Queries and overview**
- Dynamic query and chart for any question outside the fixed tools.
- Consolidated net worth and cash-flow projection.
- On-demand daily report plus automatic weekly/monthly reports.

**Trust in AI usage**
- Model routing per task type, implemented and in use (see "Project status").
- Observability: every AI interaction is logged and traceable.
- Token cost report, compared against reference models.

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | [Node.js](https://nodejs.org/) 22+ / [TypeScript](https://www.typescriptlang.org/) |
| Bot | [grammY](https://grammy.dev/) (Telegram) and [WAHA](https://waha.devlike.pro/) (WhatsApp, self-hosted) |
| AI | [OpenRouter](https://openrouter.ai/), routed by flow (SDK [`openai`](https://www.npmjs.com/package/openai)) |
| Database | Encrypted SQLite ([`better-sqlite3-multiple-ciphers`](https://www.npmjs.com/package/better-sqlite3-multiple-ciphers)), plain SQL migrations |
| Validation | [Zod](https://zod.dev/) |
| Logging | [Pino](https://getpino.io/) |
| Tests | [Vitest](https://vitest.dev/) |
| Deploy | [Docker Compose](https://docs.docker.com/compose/), isolated environments (Staging / Production) |

## Project status

| Phase | Delivery | Status |
|---|---|---|
| 1 | Skeleton: bot, database, Docker, environments, allowlist, observability | ✅ Done |
| 2 | Public case study (project documentation/outreach) | ⏸ Postponed |
| 3 | Tool calling: log/query/edit, debts, high-impact confirmation | ✅ Done |
| 4 | Conversation context and memory | ✅ Done |
| 5 | AI routing by flow + price monitoring | ✅ Done |
| 6 | Automated reports, internal benchmark, assisted categorization, voice/photo/spreadsheet input | ✅ Done |
| 7 | Email integration (invoices/installments) and Google Calendar | ✅ Done |
| 8 | Bank aggregation via Open Finance (Pluggy) | ✅ Done |
| 9 | Multi-channel: WhatsApp (via WAHA) alongside Telegram — proactive messages, two-way chat and commands | ✅ Done |
| 10 | Localization (Portuguese/English/Spanish) | ✅ Done |
| 11 | Pre-production: publish the Google OAuth app (ends the 7-day token expiry) | 📝 Planned |
| 12 | Platform observability (Grafana + Loki) | 💡 Future idea |

> **Current state:** Phases 1 to 10 are done and tested in **Staging** (`development` branch). **Nothing has been promoted to Production yet** — promotion is always an explicit decision, after real manual testing.

> **Note on Phase 5:** the flow-based routing mechanism (`roteamento_tarefas` table) is implemented and in use — simpler flows (context summary, monthly report) and media flows (receipt reading) use their own models; everything else falls back to the default (`openai/gpt-6-luna`). Changing a flow's model needs no code, just a write to the table.

Full log, with the reasoning behind every decision, in [PROGRESSO.md](PROGRESSO.md) (in Portuguese).

## Infrastructure

<p align="center">
  <picture>
    <source media="(max-width: 600px)" srcset="docs/assets/infra-diagram.svg">
    <img src="docs/assets/infra-diagram-wide.svg" alt="Infrastructure diagram: user on Telegram exchanging messages with the VM, which runs the Staging and Production environments via Docker Compose, with calls routed to OpenRouter" width="760" />
  </picture>
</p>

The VM is the only bridge between the messaging channels (Telegram and WhatsApp) and the model — no channel talks to OpenRouter directly, everything goes through the bot running on it. The diagram shows the Telegram flow; WhatsApp enters through the same bot, via a WAHA container in the same `docker-compose.yml`.

A single VM runs both environments side by side, each as a separate service in the same `docker-compose.yml`. The branch maps to the environment: `development` runs the Staging service, `master` runs Production — and promoting one to the other is never automatic, it only happens by explicit decision after real manual testing.

## Running locally

<details>
<summary>Docker Compose (Staging)</summary>

```bash
cp .env.example .env.homologacao   # fill in TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_CHAT_IDS, etc.
docker compose up -d homologacao
```

Environments are isolated by branch and by service in `docker-compose.yml` — `development` maps to Staging, `master` maps to Production (never promoted automatically, always by explicit decision after real manual testing).

</details>

## Security and privacy

- User allowlist (Telegram and WhatsApp) — only authorized chat IDs and numbers can interact with the bot.
- WhatsApp webhook with signature validation (HMAC) and per-event idempotency.
- Database encrypted at rest (SQLCipher via `better-sqlite3-multiple-ciphers`).
- Secrets never committed — Gitleaks pre-commit hook, also run in CI.
- Personal use, single-user by design — there is no multi-user flow.
- Deletion is always logical: no data ever truly disappears from the history.

## License

[MIT](LICENSE)

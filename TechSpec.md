# Technical Specification (TechSpec)

## 1. Stack Overview

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | React (Vite), plain CSS (CSS variables, no heavy UI framework) | Fast build, small bundle, full control over accessibility |
| Backend | Node.js + Express | Lightweight, no build step, easy to reason about |
| Database | SQLite (single file, via `better-sqlite3`) | Zero-config, file-based, keeps repo/runtime under size limits, no external DB server needed |
| AI Layer | LLM API (Gemini 1.5 Flash *or* OpenAI gpt-4o-mini, free/low-cost tier) called server-side only | Used strictly for natural-language coaching on top of pre-computed numbers — never for arithmetic |
| Auth | Simple email + password, hashed (bcrypt), JWT session cookie | Single-user accounts only, no third-party OAuth needed for v1 |
| Charts | `recharts` (React) | Small, accessible, SVG-based |
| Testing | Jest (backend logic), React Testing Library (frontend) | Required by evaluation criteria ("Testing") |

**Why not a bundled/local LLM:** Any local model large enough to be useful would blow the 10MB repo budget instantly. Calling a hosted LLM API keeps the repo small and is the only realistic way to satisfy both "smart AI assistant" and the size constraint simultaneously.

## 2. High-Level Architecture

```
┌─────────────────┐      HTTPS/JSON       ┌──────────────────────┐
│  React SPA       │ ───────────────────► │  Express API          │
│  (Vite build)     │ ◄─────────────────── │  - Auth routes         │
└─────────────────┘                       │  - Activity CRUD       │
                                           │  - Calculation Engine  │
                                           │  - Recommendation       │
                                           │    Orchestrator         │
                                           └─────────┬────────────┘
                                                      │
                                  ┌───────────────────┼───────────────────┐
                                  ▼                                       ▼
                          ┌───────────────┐                     ┌──────────────────┐
                          │ SQLite (file)  │                     │ LLM API (external) │
                          │ users, logs,   │                     │ called ONLY with   │
                          │ recommendations│                     │ pre-computed stats │
                          └───────────────┘                     └──────────────────┘
```

### Key architectural rule (Security + Reliability)
The LLM **never** receives raw free text from the user and **never** performs the CO2e math. The flow is strictly:

1. User submits an activity → Express validates & stores it.
2. **Calculation Engine** (pure deterministic JS module, unit-tested) computes CO2e using factors defined in `rules.md` / `emissionFactors.json`.
3. **Recommendation Orchestrator** assembles a small structured JSON context (category totals, top contributor, % of total, delta scenarios) — no PII beyond first name.
4. This structured JSON is interpolated into a fixed, version-controlled prompt template and sent server-side to the LLM API.
5. LLM response (advice text only, no numbers it invented) is stored and returned to the client.
6. If the LLM API call fails or the API key is missing, the system **falls back to a deterministic rule-based template** (defined in `rules.md`) so the app remains fully functional offline/keyless — this satisfies "responsible implementation" and avoids a single point of failure.

## 3. API Endpoints

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, returns JWT cookie |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/activities` | List user's logged activities (filterable by date range/category) |
| POST | `/api/activities` | Log a new activity |
| DELETE | `/api/activities/:id` | Remove a logged activity |
| GET | `/api/dashboard/summary` | Aggregated totals, category breakdown, trend data |
| GET | `/api/recommendations` | Latest AI-generated reduction plan (cached, regenerated on new significant data) |
| POST | `/api/recommendations/:id/commit` | User commits to a suggested action |
| GET | `/api/recommendations/:id/adherence` | Adherence tracking against a committed action |
| GET | `/api/reference/emission-factors` | Returns documented emission factors (transparency/"Why this number?" feature) |

## 4. LLM Integration Details

- Called from backend only (`services/llmClient.js`); API key stored in `.env`, never committed, never exposed to frontend.
- Request includes: top category name, % share of total footprint, top sub-activity, a 1–2 "what-if" delta already computed in code, and the user's first name only.
- Prompt template enforces: max 1–3 suggestions, must reference the provided numbers, no fabricated statistics, encouraging tone, no guilt-based language (ties into PRD's non-judgmental goal).
- Response is parsed as constrained JSON (`{summary, actions: [{text, estimatedSavingKg}]}`) — `estimatedSavingKg` for each action is **recalculated/validated server-side**, not trusted blindly from the LLM, to avoid hallucinated numbers reaching the user.
- Timeout (e.g., 8s) + retry-once policy; on failure, falls back to the rule-based template engine (Section 2, step 6).

## 5. Security Considerations

- Passwords hashed with bcrypt (cost factor 12), never stored/logged in plaintext.
- JWT stored as `httpOnly`, `secure`, `sameSite=strict` cookie — not accessible to client JS (XSS mitigation).
- All inputs validated server-side (`zod` or `express-validator`) — category/sub-type restricted to enum allowlist, quantities bounded (no negative/absurd values).
- Rate limiting on auth routes (`express-rate-limit`) to deter brute force.
- LLM API key never exposed client-side; all third-party calls proxied through backend.
- SQL injection mitigated by using parameterized queries exclusively (`better-sqlite3` prepared statements).
- `.env` and `*.db` files included in `.gitignore` — no secrets or user data committed to the repo.
- CORS restricted to the deployed frontend origin only.

## 6. Repo Size & Submission Constraints

- No `node_modules` committed (`.gitignore`).
- No bundled datasets, model weights, or media assets beyond a few small SVG icons.
- SQLite database file excluded from version control; a `seed.js` script populates demo data for evaluators (`npm run seed`).
- Single `main` branch only; no feature branches retained at submission time.
- Target total committed source size: well under 10MB (realistically a few hundred KB of source code).

## 7. Local Setup (for evaluators)

```bash
git clone <repo-url>
cd ecotrace
npm install --prefix server
npm install --prefix client
cp server/.env.example server/.env   # add LLM_API_KEY (optional — app works without it via fallback)
npm run seed --prefix server          # optional demo data
npm run dev --prefix server           # starts API on :5000
npm run dev --prefix client           # starts Vite dev server on :5173
```

## 8. Testing Strategy

- **Unit tests (Jest)**: Calculation Engine — verify CO2e math for every category/sub-type against known factor values; edge cases (zero, max bounds, missing factor).
- **Unit tests**: Recommendation Orchestrator's fallback template logic (LLM-independent path).
- **Integration tests**: API routes via `supertest` — auth flow, activity CRUD, dashboard aggregation correctness.
- **Frontend tests (RTL)**: form validation, dashboard renders correct totals given mock API data, accessibility roles present.
- **Manual accessibility pass**: keyboard-only navigation, screen reader labels, axe-core automated scan.

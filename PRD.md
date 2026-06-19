# Product Requirements Document (PRD)

## Project Name
**EcoTrace** — A Personal Carbon Footprint Tracker & Reduction Coach

## Chosen Vertical
**Sustainability / Climate Action Assistant**

EcoTrace is built around a single persona-driven problem: most people *want* to reduce their environmental impact but have no concrete sense of (a) what their footprint actually is, (b) which of their habits matters most, or (c) what a realistic next step looks like. Generic "tips to save the planet" articles fail because they aren't personalized — telling a vegetarian to eat less meat, or a remote worker to drive less, wastes their attention and erodes trust in the advice.

EcoTrace solves this by combining a deterministic carbon-accounting engine with a contextual AI coaching layer, so every piece of advice is tied to the user's *own* logged behavior.

---

## 1. Problem Statement

Individuals lack:
1. A simple way to log everyday activities (commute, energy use, diet, purchases) and see them converted into a real unit (kg CO2e).
2. Visibility into *which category* of their life is driving their footprint.
3. Personalized, prioritized actions — not generic listicles — that account for what they've already logged and tried.
4. Motivation/feedback loops that make reduction feel achievable rather than abstract or guilt-inducing.

## 2. Target Persona

**Primary Persona: "Aware Aman"**
- 22–40 years old, urban/semi-urban, smartphone-first.
- Cares about climate impact but has never quantified his own footprint.
- Has tried "being more eco-friendly" in vague ways (reusable bags, etc.) without knowing if it matters.
- Wants quick logging (under 30 seconds per entry) and clear, non-judgmental guidance.

**Secondary Persona: "Competitive Priya"**
- Motivated by visible progress, streaks, and comparison against benchmarks (national/global average).
- Wants weekly summaries and a sense of measurable improvement over time.

## 3. Goals

| Goal | Description |
|---|---|
| G1 | Let users log daily/weekly activities across key emission categories in under 30 seconds. |
| G2 | Convert logged activities into standardized CO2e estimates using transparent, documented emission factors. |
| G3 | Identify the user's single highest-impact category and surface it clearly (not buried in a chart). |
| G4 | Generate a personalized, prioritized reduction plan via an LLM, grounded strictly in the user's own data (no generic advice). |
| G5 | Track adherence to recommended actions and show measurable footprint trend over time. |
| G6 | Be accessible (screen-reader friendly, keyboard navigable, color-contrast safe) and lightweight (repo < 10MB). |

## 4. Non-Goals (Explicit Assumptions / Scope Boundaries)

- Not a carbon offset marketplace or payment product.
- Not a scientifically certified carbon auditing tool (uses publicly available average emission factors, clearly cited and documented — see `rules.md`).
- No multi-tenant/enterprise accounts; single-user-per-login model only.
- No native mobile app — responsive web app only.
- No real-time IoT/smart-meter integration (manual + simple form-based logging only).

## 5. Core Features

### 5.1 Activity Logging (Track)
- Quick-add forms for 4 categories: **Transport, Home Energy, Food/Diet, Consumption/Waste**.
- Each entry: category, sub-type (e.g., "car - petrol", "flight - domestic"), quantity, unit, date.
- Bulk/recurring entry support (e.g., "log this commute every weekday").

### 5.2 Footprint Dashboard (Understand)
- Total CO2e (daily/weekly/monthly view).
- Category breakdown (donut/bar chart).
- Comparison against national average benchmark (configurable, India default).
- Trend line over time.

### 5.3 Reduction Engine (Reduce) — *Core Differentiator*
- Deterministic backend logic identifies:
  - The user's highest-impact category this period.
  - The single highest-impact sub-activity within it.
  - A delta-based "what-if" calculation (e.g., "replacing 2 of 5 weekly car commutes with transit saves ~X kg CO2e/month").
- This structured context (not raw chat) is passed to an LLM which generates:
  - A short, encouraging, non-judgmental explanation.
  - 1–3 ranked, specific, achievable actions tied to the user's actual data.
- User can "commit" to a recommended action; the app then tracks whether subsequent logs reflect that change and reports back ("You kept your commitment 4/5 days this week — that's ~3kg CO2e saved").

### 5.4 Insights & Nudges
- Passive nudges on the dashboard (e.g., "Your Tuesday commute logs are your biggest weekly contributor").
- Weekly auto-generated summary (LLM-written, grounded in computed stats).

### 5.5 Accessibility & Trust
- All emission factors and sources documented and viewable in-app ("Why this number?" tooltip).
- WCAG-AA compliant color contrast, full keyboard navigation, semantic HTML, alt text.

## 6. Success Metrics (for this challenge submission)

- Functional demo: user can log an activity → see updated dashboard → receive a grounded AI recommendation → commit to it → see adherence tracked.
- Code quality: modular separation between calculation engine, API, and UI.
- Repo size < 10MB, single branch, public.
- README clearly documents vertical, logic, assumptions per submission guidelines.

## 7. Out of Scope for v1 (Future Work)
- Social/leaderboard features.
- Receipt/bill OCR auto-import.
- Multi-language support.
- Mobile push notifications.

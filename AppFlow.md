# Application Flow (AppFlow)

This document maps the user journey screen-by-screen and the underlying data flow, including exactly when and how the AI layer is invoked.

## 1. End-to-End User Journey (Happy Path)

```
Landing/Login → Onboarding (3 quick questions) → Dashboard (empty state)
   → Log Activity → Dashboard (populated) → View AI Recommendation
   → Commit to Action → Daily Logging Continues → Adherence Feedback
   → Weekly Summary
```

## 2. Screen-by-Screen Breakdown

### 2.1 Landing / Auth
- Minimal landing page: value proposition ("Know your footprint. Reduce it, step by step.") + Login/Register.
- Register: name, email, password, optional household size (used only to contextualize benchmarks, not for advertising/data sale — stated in README assumptions).

### 2.2 Onboarding (one-time, skippable)
- 3 quick questions to set sane defaults: primary commute mode, rough home energy source (grid/renewable mix if known), diet pattern (omnivore/vegetarian/vegan).
- These are *defaults* the user can override per-log, not locked-in facts — reduces first-log friction.

### 2.3 Dashboard (Home)
- **Empty state**: friendly prompt to log first activity, no scary empty charts.
- **Populated state**:
  - Header stat: total CO2e this week/month + comparison delta vs. last period.
  - Category breakdown donut (Transport / Energy / Food / Consumption).
  - Trend line (last 8 weeks).
  - "Your Reduction Plan" card — surfaces the top AI recommendation prominently, not buried.
  - Benchmark comparison bar ("You vs. national average").

### 2.4 Log Activity (Quick-Add)
- Modal/drawer, not a full page nav — keeps logging under 30 seconds (PRD goal).
- Step 1: Select category (4 large tappable icons).
- Step 2: Select sub-type from filtered list (e.g., Transport → Car/Bus/Train/Flight/Walk-Bike).
- Step 3: Enter quantity (distance/units) + date (defaults to today).
- Inline real-time estimate shown before submit ("≈ 4.2 kg CO2e") — pulled instantly from the deterministic Calculation Engine, no LLM call here (keeps logging fast and free of API latency).
- Submit → POST `/api/activities` → triggers recompute of dashboard aggregates.

### 2.5 AI Recommendation Flow (Core Differentiator)
Trigger conditions for regenerating a recommendation (not on every single log, to avoid redundant API calls/cost):
- First time user reaches 5 logged activities, OR
- A new category becomes the top contributor, OR
- 7 days have passed since the last recommendation, OR
- User manually taps "Refresh my plan."

Sequence:
1. Frontend calls `GET /api/recommendations`.
2. Backend checks cache validity (per trigger conditions above). If stale/missing:
   a. Calculation Engine aggregates current totals + identifies top category/sub-activity + computes 1–2 what-if deltas.
   b. Recommendation Orchestrator builds structured context JSON.
   c. Orchestrator calls LLM API with fixed prompt template.
   d. Response parsed/validated; any numeric claims re-verified against engine output; mismatches are corrected, not trusted.
   e. If LLM call fails/times out → fallback rule-based template produces equivalent structured output.
   f. Result cached in `recommendations` table.
3. Frontend renders: short encouraging summary + ranked action cards, each with a "Commit to this" button.

### 2.6 Commit & Adherence Tracking
- User taps "Commit to this" on an action (e.g., "Take transit 2x this week instead of driving").
- Creates a row in `commitments` linked to the recommendation.
- Subsequent activity logs in the relevant category are automatically checked against the commitment's target.
- Dashboard surfaces a small adherence widget: "3/5 transit days logged this week — keep going" with the running CO2e saved relative to baseline.
- At commitment period end (default 7 days), a closing message: success/partial/missed, framed supportively, then engine re-evaluates whether to generate a new recommendation.

### 2.7 Weekly Summary
- Auto-generated (same LLM-or-fallback pattern) short paragraph: total footprint, biggest change vs. last week, one encouraging note, one new focus area.
- Surfaced as a dismissible card on dashboard load if a new week has started.

### 2.8 Transparency Screen ("Why this number?")
- Accessible from any CO2e figure via an info icon.
- Shows the exact emission factor used, its source/citation, and the formula applied (quantity × factor) — builds trust, supports "Security/responsible implementation" by avoiding black-box numbers.

## 3. Data Flow Diagram (Conceptual)

```
[User Input: Activity Form]
        │
        ▼
[POST /api/activities] ── validate (server) ──► [SQLite: activities table]
        │
        ▼
[Recompute aggregates] ──► [SQLite: cached aggregates / on-the-fly query]
        │
        ▼
[Dashboard GET /api/dashboard/summary] ──► [React renders charts]

(separately, on trigger conditions)

[Recommendation Orchestrator] ──reads──► [activities aggregates]
        │
        ▼
[Structured JSON context] ──► [LLM API] ──► [parsed advice]
        │                                         │
        ▼ (on failure)                            ▼
[Fallback rule template] ─────────────────► [SQLite: recommendations table]
        │
        ▼
[GET /api/recommendations] ──► [React renders recommendation card]
```

## 4. Error & Edge States

- No activities logged yet → dashboard shows guided empty state, no recommendation call made (nothing to base it on).
- LLM API key missing/invalid or network failure → fallback engine used silently; user is never shown a broken/error state for this feature.
- User logs an absurd value (e.g., 100,000 km commute) → server-side validation caps/rejects with a clear inline error.
- User deletes all activities → recommendation cache invalidated, dashboard reverts to empty state gracefully.

# Rules & Logic Specification

This document is the "brain" of EcoTrace — it defines exactly how raw activity logs become CO2e numbers, how the app decides what to recommend, and how the AI layer is constrained so it stays grounded, safe, and predictable. This is the primary artifact demonstrating "logical decision making based on user context" for evaluation.

## 1. Emission Factor Sources & Assumptions

All factors live in `server/data/emissionFactors.json` (see Schema.md §7). Sources used:
- DEFRA (UK Dept. for Environment, Food & Rural Affairs) Greenhouse Gas Conversion Factors — transport and fuel.
- IPCC default emission factors — general combustion/fuel.
- India CEA (Central Electricity Authority) grid average emission factor — electricity.
- Poore & Nemecek, *Science* (2018), "Reducing food's environmental impacts through producers and consumers" — food category averages.
- EPA / WRAP industry averages — waste and consumption estimates.

**Explicit assumption:** These are *population averages*, not individualized lab measurements. EcoTrace is a behavioral awareness and coaching tool, not a certified carbon audit. This is stated in the README and in the in-app "Why this number?" panel so users have accurate expectations.

## 2. Calculation Engine Rules

Pure function, fully deterministic, unit-tested, lives in `server/engine/calculate.js`.

```
co2e_kg = quantity × emissionFactors[category][sub_type].factor
```

Rules:
- R1: If `sub_type` is not found in the factor table → reject the activity with a 400 error (never silently default to 0 or guess).
- R2: `quantity` must be `> 0` and `< 100000` (Schema.md §3 CHECK constraint) — rejects nonsensical input at both DB and API validation layer (defense in depth).
- R3: `co2e_kg` is always computed server-side at write time and stored — never trust a client-supplied CO2e value, even if the frontend shows a live preview (the preview is a client-side mirror of the same factor table for UX speed, but the authoritative value is recalculated on submit).
- R4: Rounding: stored at full float precision; displayed rounded to 1 decimal place (or nearest whole kg for totals > 100kg, to avoid false precision in the UI).

## 3. Aggregation Rules (Dashboard)

- A1: "This period" totals default to current calendar month; user can toggle week/month/custom range.
- A2: Category share % = `category_total / overall_total × 100`, computed live, not cached, since it must always reflect current data.
- A3: Trend line buckets activities by ISO week, summing `co2e_kg` per week, last 8 buckets.
- A4: Benchmark comparison uses a fixed reference value (configurable constant, default: India per-capita monthly average ≈ 145 kg CO2e for the tracked categories) — sourced and labeled as an approximation, not a precise figure, with a citation link.

## 4. Recommendation Trigger Rules

A new recommendation is generated **only** when one of these is true (avoids unnecessary LLM calls — cost/efficiency, per evaluation criteria):

- T1: User has ≥5 total logged activities AND no recommendation exists yet.
- T2: The top contributing category for the current period differs from the `top_category` stored on the most recent recommendation.
- T3: ≥7 days have elapsed since `recommendations.generated_at` for the latest recommendation.
- T4: User explicitly requests via "Refresh my plan."

If none apply, the cached latest recommendation is served as-is.

## 5. Top-Contributor & What-If Selection Logic

Step-by-step, executed in `server/engine/recommend.js` before any AI call:

1. Compute category totals for the current period.
2. `topCategory` = category with highest `co2e_kg` sum.
3. Within `topCategory`, compute totals per `sub_type`; `topSubType` = highest contributor.
4. Generate up to 2 **what-if deltas** using a fixed substitution map per category (see §6) — e.g., for transport, "replace N of your weekly car trips with the next-cleanest mode you've also logged, or transit if none logged."
5. Each what-if delta is computed with the *same deterministic formula* as the Calculation Engine — the saving number is never invented, only the LLM's surrounding language is generated.
6. Package into context object:
   ```json
   {
     "userFirstName": "Aman",
     "topCategory": "transport",
     "topCategorySharePct": 52.3,
     "topSubType": "car_petrol",
     "whatIfOptions": [
       { "description": "swap 2 of 5 weekly car_petrol trips to bus", "estimatedSavingKgPerMonth": 6.1 },
       { "description": "swap 1 of 5 weekly car_petrol trips to bicycle_walk", "estimatedSavingKgPerMonth": 3.3 }
     ]
   }
   ```

## 6. Substitution Map (per category — deterministic, no LLM involved)

| Category | Default substitution suggested if user hasn't logged an alternative |
|---|---|
| transport | car/two_wheeler → bus or train (whichever has lower factor); any → bicycle_walk as the "zero" option |
| energy | no direct substitution; suggest usage *reduction* % (e.g., -15% kWh) rather than swapping source |
| food | beef_meal → chicken_meal → vegetarian_meal → vegan_meal (one step down the chain, not a jump straight to vegan, to keep suggestions realistic and non-extreme) |
| consumption | fast_fashion_item / electronics_item → suggest frequency reduction (e.g., "extend usage by N months") rather than a substitute item |

This table is the core "logical decision making" artifact — it's why the recommendation isn't generic ("eat less meat") but contextual and incremental (one realistic step down, grounded in what the user actually logs).

## 7. LLM Prompt Contract

Fixed system prompt (version-controlled in `server/engine/prompts.js`), summarized:

> You are a supportive sustainability coach. You will be given a JSON object with a user's first name and pre-computed footprint statistics. Using ONLY the numbers provided, write a short (2–3 sentence) encouraging summary and up to 3 ranked action suggestions based on the `whatIfOptions` given. Do NOT invent any statistics, percentages, or savings figures not present in the input. Do NOT use guilt-based or alarmist language. Respond ONLY in the following JSON shape: `{ "summary": string, "actions": [{ "text": string, "estimatedSavingKg": number }] }`.

Server-side enforcement after the LLM responds:
- L1: Response must parse as valid JSON matching the schema — if not, fall back to rule-based template (§8).
- L2: Every `estimatedSavingKg` in the response is **cross-checked** against the `whatIfOptions` values sent in; if the LLM altered a number, it is overwritten with the original computed value before storage/display. The LLM's only true creative latitude is wording, never numbers.
- L3: `actions` array truncated to max 3 entries regardless of what's returned.
- L4: Basic content filter on `summary` text (length cap, banned alarmist phrase list) before display.

## 8. Fallback Rule-Based Template (No API Key / API Failure Path)

If the LLM call fails, times out, or no API key is configured, this deterministic template runs instead — ensuring the app is **fully functional offline**, per TechSpec §2 step 6:

```
summary = "{topCategory} makes up {topCategorySharePct}% of your footprint this month, 
           mostly from {topSubType}. Here's a realistic next step:"

actions = whatIfOptions.map(opt => ({
  text: "Try: " + opt.description,
  estimatedSavingKg: opt.estimatedSavingKgPerMonth
}))
```

This guarantees feature parity (minus natural-language polish) with zero external dependency — important for "Security/responsible implementation" since the app never degrades into a broken state due to a missing/invalid third-party key.

## 9. Adherence Evaluation Rules

- D1: When a commitment is created, snapshot `baseline_co2e_kg` for the `target_category` over the prior 7 days.
- D2: Daily, check new activities in `target_category` logged within the commitment's date range.
- D3: At `end_date`: compare actual category total during the commitment window vs. `baseline_co2e_kg`.
  - If actual ≤ baseline − (50% of the promised saving) → `status = 'success'`.
  - If actual < baseline but less reduction than above → `status = 'partial'`.
  - If actual ≥ baseline → `status = 'missed'` (displayed supportively, never punitively — e.g., "This one didn't land — let's try a different approach" rather than a failure message).
- D4: Outcome feeds back into Recommendation Trigger Rules (§4) — a 'missed' status increases priority of trying an alternative what-if option from the substitution map next cycle, rather than re-suggesting the same action (basic context-memory, no ML needed).

## 10. Why These Rules Satisfy the Challenge's "Smart Assistant" Requirement

- **Logical decision making based on context**: §4–6, §9–D4 are all deterministic, explainable, auditable decision trees driven by the user's own data — not a black box.
- **Practical/real-world usability**: substitutions are incremental (§6), never extreme asks.
- **AI used responsibly**: LLM is sandboxed to language generation only; every number a user sees is independently verifiable and was computed by code, satisfying both the "Security" and "Efficiency" evaluation tiers.

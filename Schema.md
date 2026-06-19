# Database Schema (SQLite)

Single-file SQLite database (`ecotrace.db`, excluded from version control via `.gitignore`; created/seeded via `npm run migrate` / `npm run seed`).

## 1. Entity Relationship Overview

```
users (1) ──── (many) activities
users (1) ──── (many) recommendations
recommendations (1) ──── (many) action_items
action_items (1) ──── (0/1) commitments
commitments (1) ──── (many) activities  [logical link via category+date range, see §6]
```

## 2. Table: `users`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `name` | TEXT | NOT NULL | First name only stored/used in LLM prompts |
| `email` | TEXT | NOT NULL, UNIQUE | |
| `password_hash` | TEXT | NOT NULL | bcrypt hash, never plaintext |
| `household_size` | INTEGER | DEFAULT 1 | Used to contextualize benchmark comparisons |
| `default_commute_mode` | TEXT | NULLABLE | Set during onboarding |
| `default_diet` | TEXT | NULLABLE | omnivore / vegetarian / vegan / other |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | ISO8601 |

## 3. Table: `activities`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `user_id` | INTEGER | NOT NULL, FOREIGN KEY → users.id | |
| `category` | TEXT | NOT NULL, CHECK IN ('transport','energy','food','consumption') | Enum-restricted |
| `sub_type` | TEXT | NOT NULL | e.g., 'car_petrol', 'bus', 'flight_domestic', 'electricity_grid', 'beef_meal' — must match a key in `emissionFactors.json` |
| `quantity` | REAL | NOT NULL, CHECK (quantity > 0 AND quantity < 100000) | Bounded to reject absurd input |
| `unit` | TEXT | NOT NULL | 'km', 'kWh', 'meal', 'item', etc. |
| `co2e_kg` | REAL | NOT NULL | Computed server-side at insert time, never client-supplied |
| `activity_date` | TEXT | NOT NULL | ISO8601 date (the date the activity occurred, not logged) |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | |

**Index:** `(user_id, activity_date)` — supports fast date-range aggregation for dashboard queries.
**Index:** `(user_id, category)` — supports category breakdown queries.

## 4. Table: `recommendations`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `user_id` | INTEGER | NOT NULL, FOREIGN KEY → users.id | |
| `top_category` | TEXT | NOT NULL | Snapshot of category that triggered this recommendation |
| `top_category_share_pct` | REAL | NOT NULL | e.g., 52.3 |
| `summary_text` | TEXT | NOT NULL | LLM-generated (or fallback-template-generated) encouraging summary |
| `source` | TEXT | NOT NULL, CHECK IN ('llm','fallback') | Transparency: was this AI-generated or rule-fallback |
| `generated_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Used for the "7 days passed" regeneration trigger |

## 5. Table: `action_items`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `recommendation_id` | INTEGER | NOT NULL, FOREIGN KEY → recommendations.id | |
| `rank` | INTEGER | NOT NULL | 1–3, display order |
| `action_text` | TEXT | NOT NULL | e.g., "Take transit 2x this week instead of driving" |
| `estimated_saving_kg` | REAL | NOT NULL | **Recalculated/validated server-side**, not trusted raw from LLM output |
| `target_category` | TEXT | NOT NULL | Used to match future activities for adherence tracking |

## 6. Table: `commitments`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `user_id` | INTEGER | NOT NULL, FOREIGN KEY → users.id | |
| `action_item_id` | INTEGER | NOT NULL, FOREIGN KEY → action_items.id | |
| `start_date` | TEXT | NOT NULL | |
| `end_date` | TEXT | NOT NULL | Default start_date + 7 days |
| `status` | TEXT | NOT NULL, CHECK IN ('active','success','partial','missed'), DEFAULT 'active' | Evaluated at end_date |
| `baseline_co2e_kg` | REAL | NOT NULL | Snapshot of relevant-category footprint at commitment start, for delta comparison |

## 7. Reference Data (Not a DB Table — Versioned JSON File)

`server/data/emissionFactors.json` — a small, version-controlled, human-readable file (not a database table) since it's reference/config data, not user data. Kept out of SQLite intentionally so it can be reviewed/cited directly in `rules.md` and in the "Why this number?" UI.

```json
{
  "transport": {
    "car_petrol":      { "factor": 0.192, "unit": "kg_per_km", "source": "DEFRA/IPCC avg petrol car" },
    "car_diesel":      { "factor": 0.171, "unit": "kg_per_km", "source": "DEFRA/IPCC avg diesel car" },
    "bus":             { "factor": 0.105, "unit": "kg_per_km", "source": "DEFRA avg local bus" },
    "train":           { "factor": 0.041, "unit": "kg_per_km", "source": "DEFRA national rail avg" },
    "flight_domestic": { "factor": 0.246, "unit": "kg_per_km", "source": "DEFRA domestic flight avg" },
    "two_wheeler":     { "factor": 0.103, "unit": "kg_per_km", "source": "IPCC avg motorcycle/scooter" },
    "bicycle_walk":    { "factor": 0,     "unit": "kg_per_km", "source": "Zero direct emissions" }
  },
  "energy": {
    "electricity_grid": { "factor": 0.71, "unit": "kg_per_kWh", "source": "India CEA grid emission factor avg" },
    "lpg_cooking":       { "factor": 2.98, "unit": "kg_per_kg", "source": "IPCC LPG combustion factor" }
  },
  "food": {
    "beef_meal":       { "factor": 6.0,  "unit": "kg_per_meal", "source": "Poore & Nemecek (2018) avg" },
    "chicken_meal":    { "factor": 1.5,  "unit": "kg_per_meal", "source": "Poore & Nemecek (2018) avg" },
    "vegetarian_meal": { "factor": 0.5,  "unit": "kg_per_meal", "source": "Poore & Nemecek (2018) avg" },
    "vegan_meal":      { "factor": 0.3,  "unit": "kg_per_meal", "source": "Poore & Nemecek (2018) avg" }
  },
  "consumption": {
    "fast_fashion_item": { "factor": 8.0, "unit": "kg_per_item", "source": "WRAP/industry avg garment lifecycle" },
    "electronics_item":  { "factor": 70.0, "unit": "kg_per_item", "source": "Industry avg manufacturing footprint" },
    "general_waste_kg":  { "factor": 0.45, "unit": "kg_per_kg", "source": "EPA landfill avg" }
  }
}
```

*Note: All factors are illustrative averages compiled from publicly cited methodologies (DEFRA, IPCC, EPA, Poore & Nemecek 2018) — see `rules.md` §1 for full citation list and the explicit assumption that these are averages, not precise individual measurements.*

## 8. Data Retention / Privacy Notes
- No third-party tracking/analytics tables.
- Email is the only PII stored beyond name; never sent to the LLM API (only first name + aggregated numeric context is sent — see TechSpec §4).

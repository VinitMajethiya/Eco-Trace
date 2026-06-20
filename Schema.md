# Database Schema (PostgreSQL)

EcoTrace uses a PostgreSQL database (configured locally via Docker Compose, and hosted on Render managed PostgreSQL in production).

## 1. Entity Relationship Overview

```
users (1) ──── (many) activities
users (1) ──── (many) recommendations
users (1) ──── (many) weekly_summaries
recommendations (1) ──── (many) action_items
action_items (1) ──── (0/1) commitments
commitments (1) ──── (many) activities  [logical link via category+date range]
```

## 2. Table: `users`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | SERIAL | PRIMARY KEY | |
| `name` | VARCHAR(100) | NOT NULL | First name used in LLM prompts |
| `email` | VARCHAR(255) | NOT NULL, UNIQUE | |
| `password_hash` | VARCHAR(255) | NULLABLE | bcrypt hash (nullable to support Google OAuth) |
| `household_size` | INTEGER | DEFAULT 1 | Used to contextualize benchmark comparisons |
| `default_commute_mode` | VARCHAR(50) | NULLABLE | Set during onboarding |
| `default_diet` | VARCHAR(50) | NULLABLE | omnivore / vegetarian / vegan / other |
| `oauth_provider` | VARCHAR(50) | NULLABLE | Google, GitHub, etc. |
| `oauth_id` | VARCHAR(255) | NULLABLE | Provider user ID |
| `city` | VARCHAR(100) | NULLABLE | User location |
| `current_streak` | INTEGER | DEFAULT 0 | Consecutive days logging activities |
| `longest_streak` | INTEGER | DEFAULT 0 | Max consecutive logging days |
| `last_log_date` | DATE | NULLABLE | Date of user's last log |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | |

**Constraint:** Unique index on `(oauth_provider, oauth_id)` to handle social authentication logins.

## 3. Table: `activities`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | SERIAL | PRIMARY KEY | |
| `user_id` | INTEGER | NOT NULL, FOREIGN KEY → users.id | Cascade delete on user removal |
| `category` | VARCHAR(50) | NOT NULL, CHECK IN ('transport','energy','food','consumption') | Enum-restricted |
| `sub_type` | VARCHAR(100) | NOT NULL | e.g. 'car_petrol', 'electricity_grid', 'beef_meal' |
| `quantity` | DOUBLE PRECISION | NOT NULL, CHECK (quantity > 0 AND quantity < 100000) | Bounded |
| `unit` | VARCHAR(50) | NOT NULL | 'km', 'kWh', 'meal', 'item', etc. |
| `co2e_kg` | DOUBLE PRECISION | NOT NULL | Computed server-side at insert time |
| `activity_date` | DATE | NOT NULL | Date the activity occurred |
| `is_recurring` | INTEGER | DEFAULT 0 | Binary flag (0 = one-time, 1 = recurring log) |
| `recurring_days` | VARCHAR(50) | NULLABLE | Comma-separated list of day indices (e.g. '1,3,5') |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | |

**Index:** `(user_id, activity_date)` — supports fast date-range aggregation for dashboard queries.
**Index:** `(user_id, category)` — supports category breakdown queries.

## 4. Table: `recommendations`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | SERIAL | PRIMARY KEY | |
| `user_id` | INTEGER | NOT NULL, FOREIGN KEY → users.id | Cascade delete |
| `top_category` | VARCHAR(50) | NOT NULL | Snapshot of category triggering recommendation |
| `top_category_share_pct` | DOUBLE PRECISION | NOT NULL | e.g. 52.3 |
| `summary_text` | TEXT | NOT NULL | AI-generated summary |
| `source` | VARCHAR(50) | NOT NULL, CHECK IN ('llm','fallback') | Was this AI or fallback template |
| `is_stale` | INTEGER | DEFAULT 0 | 1 if newer activity invalidates recommendation |
| `generated_at` | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | Regeneration check |

## 5. Table: `action_items`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | SERIAL | PRIMARY KEY | |
| `recommendation_id` | INTEGER | NOT NULL, FOREIGN KEY → recommendations.id | Cascade delete |
| `rank` | INTEGER | NOT NULL | 1–3, display order |
| `action_text` | TEXT | NOT NULL | suggestion details |
| `estimated_saving_kg` | DOUBLE PRECISION | NOT NULL | Recalculated server-side |
| `target_category` | VARCHAR(50) | NOT NULL | Used to track commitments |

## 6. Table: `commitments`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | SERIAL | PRIMARY KEY | |
| `user_id` | INTEGER | NOT NULL, FOREIGN KEY → users.id | Cascade delete |
| `action_item_id` | INTEGER | NOT NULL, FOREIGN KEY → action_items.id | Cascade delete |
| `start_date` | DATE | NOT NULL | Commitment start |
| `end_date` | DATE | NOT NULL | Commitment end (usually start + 7 days) |
| `status` | VARCHAR(50) | DEFAULT 'active', CHECK IN ('active','success','partial','missed') | Evaluated at end_date |
| `baseline_co2e_kg` | DOUBLE PRECISION | NOT NULL | Baseline emissions |

## 7. Table: `weekly_summaries`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | SERIAL | PRIMARY KEY | |
| `user_id` | INTEGER | NOT NULL, FOREIGN KEY → users.id | Cascade delete |
| `week_start_date` | DATE | NOT NULL | Monday of the week |
| `summary_text` | TEXT | NOT NULL | Cache of LLM generated summary |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | |

**Constraint:** Unique constraint on `(user_id, week_start_date)` to act as the cache key.

## 8. Reference Data (Not a DB Table — Versioned JSON File)

`server/data/emissionFactors.json` — version-controlled reference data.

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

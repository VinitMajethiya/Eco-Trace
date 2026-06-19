# EcoTrace — Personal Carbon Footprint Tracker & Reduction Coach

EcoTrace is a responsive web application designed to help individuals quantify their daily carbon footprint, identify high-impact emission sources, and commit to realistic, data-grounded reduction goals. 

It combines a **deterministic backend calculation engine** with a **contextual AI coaching layer** that generates personalized reduction suggestions based strictly on the user's logged activity.

---

## 🎯 Product Focus & Target Audience

- **Challenge Vertical**: Climate Change / Sustainability Education & Action
- **Primary Persona**: Urban Indian Professionals & Commuters (e.g., Aman, a software engineer in Bengaluru aiming to optimize transit emissions; Priya, a young professional seeking actionable shifts towards a plant-based diet).

---

## 🚀 Key Features

1. **30-Second Activity Logging (Track)**
   - Multi-step keyboard-accessible slide-out drawer.
   - 4 key categories: **Transport, Home Energy, Food & Diet, and Consumption & Waste**.
   - Real-time client-side footprint calculation preview before submission.
   
2. **Interactive Footprint Analytics (Understand)**
   - Visual dashboard aggregating period totals (weekly/monthly) and percentage category splits.
   - Svg-based donut chart with full non-visual data tables for screen reader accessibility.
   - India per-capita monthly benchmark comparison (~145 kg CO2e) scaled to period ranges.
   - 8-week history trend charts.

3. **Carbon Reduction Engine (Reduce)**
   - Automatically computes user's highest contributing category and sub-activity.
   - Runs deterministic "what-if" substitution scenarios (e.g. swapping petrol car commutes to bus).
   - Contextual AI layer translates statistical JSON context into supportive natural language recommendations.
   - Strict server-side verification: all carbon-saving figures are re-checked against precomputed code to prevent AI number hallucinations.
   - **Zero-Failure Fallback**: If the Gemini API key is missing or calls timeout, the app seamlessly falls back to a template-driven coaching suggestion.

4. **Adherence & Commitments (Action)**
   - "Commit" to recommended action challenges.
   - Snapshots user baseline emissions over the prior 7 days.
   - Daily progress widget displaying cumulative CO2e saved relative to baseline.
   - supportive non-punitive evaluation badges (Success, Progress Made, Nice Try) for completed challenges.

5. **Why This Number? (Transparency)**
   - Every logged activity footprint features an info icon.
   - Tapping it reveals the exact formula applied, the specific factor value, and the public citation source (DEFRA, IPCC, CEA India, etc.).

---

## 🛠️ Technology Stack

- **Frontend**: React (Vite) + Plain CSS (CSS Variables, Flexbox/Grid) + Recharts + Lucide Icons.
- **Backend**: Node.js + Express + Zod (Validation) + JWT (HttpOnly Cookie Sessions) + express-rate-limit.
- **Database**: SQLite (`better-sqlite3`) for robust zero-config local storage.
- **AI Core**: Google Gemini 1.5 Flash API (server-side calls only, never exposed to client).

---

## 📋 Methodology & Emission Factor Sources

EcoTrace uses population average conversion factors sourced from official greenhouse gas databases. It is a behavioral coaching aid and not a scientific auditing product.

- **Transport**: DEFRA (UK Department for Environment, Food & Rural Affairs) conversion factors for petrol cars, diesel cars, rail, domestic flights, and local buses.
- **Electricity**: Central Electricity Authority (CEA) India grid average emission factor (~0.71 kg/kWh).
- **LPG Cooking**: IPCC default combustion emission factor (~2.98 kg/kg).
- **Food / Diet**: Poore & Nemecek (*Science*, 2018) food lifecycle category averages (beef meals, chicken, vegetarian, vegan).
- **Consumption & Waste**: WRAP fast fashion garment lifecycle estimates, EPA landfill waste averages, and general device manufacturing footprints.

---

## ⚙️ Local Setup Instructions

### Prerequisites
- Node.js (v18+)
- npm

### Installation
1. Clone this repository and navigate to the project root:
   ```bash
   cd Carbon-Footprint
   ```
2. Install dependencies for both server and client folders:
   ```bash
   npm run install-all
   ```

### Configuration
1. Create a `.env` file in the `server` directory (you can copy `server/.env.example`):
   ```bash
   cp server/.env.example server/.env
   ```
2. Set the `GEMINI_API_KEY` in `server/.env` to enable AI coach generation. If left empty, the application will automatically fall back to the rule-based recommendation template.

### Database Setup
Initialize tables and seed the database with 30 days of mock commuting, energy, and meal history:
```bash
npm run seed
```

### Running the Application
Open two separate terminal windows:

- **Terminal 1 (Backend API)**:
  ```bash
  npm run dev-server
  ```
  Runs the server on `http://localhost:5000`.

- **Terminal 2 (Vite Frontend)**:
  ```bash
  npm run dev-client
  ```
  Runs the dev server on `http://localhost:5173`. Open this URL in your browser to view the application.

*Default Seed Credentials*:
- Email: `aman@ecotrace.com`
- Password: `password123`

---

## 🧪 Testing

To run the server test suite:
```bash
npm run test-server
```

---

## 🛠️ Development Utility Scripts

The `scripts/` directory at the root level contains manual testing and verification utilities:
- `api_audit.js`: Automatically triggers backend endpoint requests and validates calculation/percentage mapping correctness.
- `test_fallback.js`: Verifies fallback templates execution under sandbox constraints.
- `test_rec_flow.js`: Exercises the raw recommendation orchestrator pipeline.
These are development tools and are not required to run the core production application.

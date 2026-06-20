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
- **Database**: PostgreSQL (managed hosted DB on Render in production; local containerized DB via Docker Compose in development).
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
- Docker Desktop (or local PostgreSQL instance running on port 5432)

### Installation & Database Setup
1. Clone this repository and navigate to the project root:
   ```bash
   cd Carbon-Footprint
   ```
2. Start the local PostgreSQL instance via Docker Compose:
   ```bash
   docker-compose up -d
   ```
3. Install dependencies for both server and client folders:
   ```bash
   npm run install-all
   ```
4. Create a `.env` file in the `server` directory (copying `server/.env.example`):
   ```bash
   cp server/.env.example server/.env
   ```
5. Apply migration schema to your local database:
   ```bash
   npm run migrate --prefix server
   ```
6. Seed the database with 30 days of mock history:
   ```bash
   npm run seed --prefix server
   ```

*Default Seed Credentials*:
- Email: `aman@ecotrace.com`
- Password: `password123`

### Running the Application Locally
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
  Runs the dev server on `http://localhost:5173`. Open this URL in your browser.

---

## 🧪 Testing

To run the server test suite:
```bash
npm run test-server
```
*Note: The test suite runs sequential database assertions using `--runInBand` and `--detectOpenHandles` to avoid state conflicts/deadlocks on the shared test database container.*

---

## 🚀 Production Deployment (Vercel & Render)

EcoTrace is architected to run as two independent services communicating cross-origin:

### 1. Frontend (Vercel)
- Hosted as a static React SPA.
- Routing redirects are handled via `client/vercel.json` to prevent 404s on page refresh.
- Setup environment variable: `VITE_API_URL` pointing to your Render backend API URL.

### 2. Backend API & DB (Render)
- **Web Service**: Hosted as a Node.js web service.
- **Database**: Spin up a managed Render PostgreSQL database, and set `DATABASE_URL` in the web service environment variables.
- Set `CLIENT_ORIGIN` pointing to your Vercel frontend URL.
- Authentication cookies are automatically configured with `sameSite: 'none'` and `secure: true` in production, allowing safe cross-origin credential verification.

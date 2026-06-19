# Design Document

## 1. Design Principles

1. **Encouraging, not guilt-driven.** No red "you're bad" colors for high footprints; framing is always "here's your next step," never shame-based. This is a deliberate product decision tying back to PRD goal G4.
2. **Numbers earn trust through transparency.** Every figure is one tap away from its source (see AppFlow §2.8).
3. **Logging friction is the enemy.** The most common action (logging an activity) must be the fastest, lowest-cognitive-load interaction in the app.
4. **Accessible by default, not as an afterthought.** This is an explicit evaluation criterion — contrast, semantics, and keyboard support are designed in from the start, not patched in later.

## 2. Visual System

### 2.1 Color Palette
Avoid the cliché "all green everything" — use a constrained palette where green is reserved specifically for *positive progress signals*, not decoration.

| Token | Hex | Usage |
|---|---|---|
| `--color-bg` | `#FAFAF7` | App background (warm off-white, not stark white) |
| `--color-surface` | `#FFFFFF` | Cards |
| `--color-ink` | `#1C2521` | Primary text (near-black, not pure black) |
| `--color-ink-muted` | `#5B6B63` | Secondary text |
| `--color-primary` | `#2E6B4F` | Primary actions, brand accent (deep forest green) |
| `--color-primary-hover` | `#244F3C` | Hover/active state |
| `--color-positive` | `#3F8A5B` | "Improved/saved" indicators |
| `--color-caution` | `#B8762E` | Top-contributor highlight (amber, not red — non-judgmental) |
| `--color-border` | `#E3E1D8` | Card borders, dividers |
| `--color-focus` | `#1E5AA8` | Focus ring (distinct from brand color, high contrast, for accessibility) |

All text/background pairs verified to meet WCAG AA contrast ratio (≥4.5:1 for body text, ≥3:1 for large text).

### 2.1.1 Dark Mode Palette
A high-contrast, premium dark mode palette is supported for reduced eye strain and enhanced accessibility:
- `--color-bg` (App background): `#0B0F19` (Slate Dark)
- `--color-surface` (Card background): `#111827` (Dark Gray)
- `--color-ink` (Primary text): `#F9FAFB` (Off-white)
- `--color-ink-muted` (Secondary text): `#9CA3AF` (Cool Gray)
- `--color-border` (Borders): `#1F2937`
- `--color-primary` / `--color-positive` (Brand/Progress signals): `#10B981` (High-contrast Green)
- `--color-caution` (Highlights): `#F59E0B` (Amber)

### 2.2 Typography
- Font stack: system UI font stack (`-apple-system, "Segoe UI", Roboto, sans-serif`) — zero font-loading weight, keeps repo/runtime light.
- Scale: 14px body / 16px base / 20px subhead / 28px headline / 36px hero stat (the "total CO2e" number gets the largest treatment on the dashboard — it's the emotional anchor of the app).
- Line height ≥1.5 for body text (readability/accessibility).

### 2.3 Spacing & Layout
- 8px base spacing unit (8/16/24/32/48 scale).
- Max content width 1100px, centered, generous padding on mobile (16px gutters).
- Mobile-first responsive breakpoints: 480px / 768px / 1024px.

## 3. Core Components

| Component | Notes |
|---|---|
| `StatCard` | Large number + label + trend arrow; used for hero CO2e figure |
| `CategoryDonut` | Recharts-based; each slice has a text alternative (table fallback) for screen readers |
| `ActivityForm` (drawer) | 3-step quick-add; large tap targets (min 44×44px); autofocus first field |
| `RecommendationCard` | Summary text + ranked `ActionChip` list + "Commit" button |
| `AdherenceTracker` | Simple progress bar + day-by-day checklist dots |
| `WhyThisNumber` (tooltip/modal) | Triggered by info icon; shows formula + source citation |
| `EmptyState` | Friendly illustration-free (SVG icon) + single clear CTA |
| `Toast` | Non-blocking confirmation on log/commit actions |

## 4. Accessibility Requirements (Explicit Checklist)

- All interactive elements reachable and operable via keyboard (`Tab`/`Shift+Tab`/`Enter`/`Space`); visible focus ring using `--color-focus`.
- Semantic HTML throughout (`<button>` not `<div onClick>`, `<nav>`, `<main>`, proper heading hierarchy `h1→h2→h3`).
- All charts have a non-visual data equivalent (visually-hidden `<table>` or `aria-label` summary) so screen reader users get the same information sighted users get from the donut/trend chart.
- Form inputs have explicit `<label>` associations; errors announced via `aria-live="polite"`.
- Color is never the sole signal (e.g., the "top contributor" category is marked with an icon + text label, not just an amber color).
- Touch targets ≥44×44px for mobile usability.
- Automated check via `axe-core` in the test suite (ties to TechSpec §8 testing strategy) plus a manual screen-reader pass (VoiceOver/NVDA) before submission.
- Respects `prefers-reduced-motion` — chart/number animations disabled for users who request it.

## 5. Key Screen Sketches (Textual Wireframe)

### Dashboard
```
┌──────────────────────────────────────────────┐
│  EcoTrace        [Log Activity +]   [Profile] │
├──────────────────────────────────────────────┤
│  This Month                                    │
│  ┌───────────────┐   ┌─────────────────────┐ │
│  │  142 kg CO2e   │   │   Category Donut     │ │
│  │  ▼ 8% vs last  │   │   Transport 52%       │ │
│  │  month          │   │   Energy 24%          │ │
│  └───────────────┘   │   Food 16% / Other 8% │ │
│                       └─────────────────────┘ │
│  ┌──────────────────────────────────────────┐ │
│  │ Your Reduction Plan                        │ │
│  │ "Transport is 52% of your footprint.       │ │
│  │ Swapping 2 commutes/week to transit saves  │ │
│  │ ~6kg CO2e/month."        [Commit]          │ │
│  └──────────────────────────────────────────┘ │
│  Trend (8 weeks)  [────────────╲────────]      │
└──────────────────────────────────────────────┘
```

### Log Activity (Drawer)
```
┌───────────────────────────┐
│  Log an Activity      [x]  │
│  ○ Transport  ○ Energy     │
│  ○ Food       ○ Consumption│
│  ──────────────────────── │
│  Sub-type: [Car - Petrol▾] │
│  Distance (km): [____]     │
│  Date: [Today ▾]           │
│  ≈ 4.2 kg CO2e estimated   │
│  [Cancel]      [Save]      │
└───────────────────────────┘
```

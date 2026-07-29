# commit.show · Audit report

**f1-predictor**
_https://github.com/raphaeltizon/f1-predictor_

## What this build missed
- Inline mock data arrays in 3 app-path files (admin/page.tsx, Countdown.tsx, Navbar.tsx) — real backend not fully wired.
- Firebase auth gap: auth_lib=firebase detected, has_auth_state_listener=false — session persistence on token refresh unhandled.

## What it got right
- All 3 routes (/predictions, /results, /leaderboard) return 200 with sub-600ms TTFB — routing is intact.
- Lighthouse mobile: Perf 84, A11y 89, BP 100, SEO 100 — no console errors or network failures during render.
- 96.9% TypeScript across 22 files with npm lockfile present — clean, typed baseline for future contributors.

## Score · 48 / 100

- Audit:      24/50
- Scout:      0/30
- Community:  1/20

---
Audited on commit.show · https://commit.show/projects/45834663-3fe2-465a-b7ed-341736be747d

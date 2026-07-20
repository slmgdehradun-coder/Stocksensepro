# StockSense Pro Subscription Audit

Date: 2026-07-09

## 1. Current Architecture Review

- The original app was a Next.js 15 client-heavy dashboard with API routes for market data and Gemini analysis.
- Authentication was stored entirely in browser `localStorage` through `lib/auth.tsx`.
- Free/Pro access was checked mostly in React components with `user?.tier === 'pro'`.
- Paper trading and portfolio state were already functional but stored in browser storage.

## 2. Bugs And Weak Areas

- Users could self-select Pro during signup, so Pro access was not trustworthy.
- Refreshing or editing `localStorage` could change access level.
- There was no admin dashboard, payment queue, block/unblock flow, subscription expiry, or calendar-day control.
- Passwords were not hashed because no server-side account store existed.

## 3. Data Accuracy Risk

- Pro features depended on UI gates only; API output could still be requested directly.
- Payment/subscription dates were not stored, so expiry could not be calculated reliably.
- Existing market-data risks from provider fallback remain documented in `TECHNICAL_AUDIT.md`.

## 4. Security Risk

- No HTTP-only session cookie, no signed token, no login rate limit, and no server-side Pro/API guard.
- No admin-only API boundary existed.
- API keys were already server-side, and the new module keeps subscription/payment secrets server-side too.

## 5. Performance Issue

- User/payment reads now use a simple JSON adapter suitable for local/demo use.
- The adapter is intentionally isolated in `lib/server/db.ts` so it can be replaced with PostgreSQL/MySQL/KV without changing UI routes.
- Vercel/serverless file writes are ephemeral; production must use a durable database.

## 6. UI/UX Issue

- Signup did not collect name/mobile or disclaimer acceptance.
- Upgrade/payment flow did not exist.
- Free/Pro state was not visible consistently.
- Admin workflows did not exist.

## 7. Financial Logic Issue

- Predictions had risk notes but the UI did not consistently show the full Indian educational disclaimer.
- Subscription expiry and active calendar days were missing.
- Payment approval did not control access.

## 8. Refactor Priority List

1. Replace client-only auth with signed server session.
2. Add server storage abstraction for users, plans, payments, settings, prediction logs, paper accounts, and watchlists.
3. Add admin APIs and admin UI.
4. Add user upgrade/payment request UI.
5. Gate Pro pages and Gemini Pro APIs server-side.
6. Add disclaimer acceptance and visible legal disclaimer across major app screens.
7. Add tests for subscription and password hashing.

## Implementation Summary

- Added secure signup/login/logout/session APIs with PBKDF2 password hashing and signed HTTP-only cookies.
- New users are always Free. Pro starts only after admin approval, manual admin date assignment, or a calendar active day.
- Added `/admin`, `/upgrade`, and `/account` pages.
- Added admin user search, status management, block/unblock, free Pro assignment, start/end dates, calendar active days, payment approval/rejection, remarks, UPI settings, QR URL, and plan amount/duration editing.
- Added server-side Pro protection for `/api/ai/prediction` and `/api/ai/options`.
- Added client guards for AI Screener, Options Chain, and Portfolio/Paper Trading.
- Added legal disclaimer components on signup/login, dashboard, prediction panel, upgrade flow, admin, strategies, screener, options, and portfolio.
- Added tests for subscription expiry/calendar access and password hashing.

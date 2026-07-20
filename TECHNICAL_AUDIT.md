# StockSense Pro Technical Audit

Date: 2026-07-07

## 1. Current Architecture Review

- The app is a Next.js 15 App Router project with client-heavy pages under `app/`, shared UI under `components/`, and market/finance helpers under `lib/`.
- Market chart data is fetched by client helpers in `lib/dataFetcher.ts`, which call `/api/yahoo` and `/api/search`. The API routes proxy Yahoo Finance, but most resolution, fallback, validation, and business decisions still live in browser code.
- Technical indicators and candlestick patterns are calculated in browser code using `technicalindicators` plus custom pattern functions.
- AI features are implemented directly in client components (`components/Chatbot.tsx`, `app/options/page.tsx`) and with a local heuristic prediction function in `lib/aiPrediction.ts`.
- Paper trading and portfolio state are stored in browser `localStorage` through `lib/usePaperTrading.ts`.
- Options chain data is currently simulated in `lib/optionsData.ts`.
- The project has no tests, no shared domain types, no data quality layer, and no hard runtime boundary between public client code and sensitive server-only operations.

## 2. Bugs and Weak Areas

- `fetchYahooFinanceData()` catches errors and returns empty data, which hides the real failure reason and makes UI error handling inconsistent.
- `app/page.tsx` checks for fewer than 50 candles after calling a fetch function that can silently return an empty result, so a symbol failure appears as a generic "not enough data" issue.
- `package.json` uses Unix commands (`rm`, `mkdir -p`, `cp`) inside the build script, which is fragile on Windows.
- `next.config.ts` disables TypeScript and ESLint failures during production builds.
- Several components use `any`, which weakens strict TypeScript mode and hides data contract problems.
- `lib/auth.tsx` hardcodes a pro user and prevents true logout, so feature gating is not meaningful.
- `SearchBar` and `dataFetcher` duplicate exchange/symbol logic, which can produce double suffixes or wrong exchange assumptions.
- `components/StockChart.tsx` renders multiple indicator panels on a single chart instance without enough user controls and relies on `any` markers/series.
- Portfolio valuation uses a fixed USD/INR value (`83`) and can misstate current value and P&L.
- `app/portfolio/page.tsx` links `/?symbol=...`, but the dashboard does not read that query parameter.
- Auto-refresh and screener loops can generate many serial requests without centralized throttling, caching, cancellation, or backoff.

## 3. Data Accuracy Risk

- Yahoo Finance is useful for broad market history, but it is not a guaranteed official source for NSE, BSE, MCX, or options chain data.
- MCX fallback converts global benchmark futures into INR approximations. This is educational at best and should be labeled as proxy/estimated data.
- Options chain analytics are simulated, so PCR, OI, max pain, IV, and support/resistance are not real market values.
- No stale-data metadata is shown beyond local refresh time. The UI does not clearly separate exchange timestamp, app fetch timestamp, proxy fallback, or estimated data.
- Index, commodity, crypto, and equity symbols use different conventions, but symbol resolution is currently a simple map plus suffix heuristics.
- Corporate actions, adjusted prices, exchange holidays, illiquid volume, and currency conversion are not validated.

## 4. Security Risk

- Gemini API keys are exposed through `NEXT_PUBLIC_GEMINI_API_KEY` and direct client SDK calls. This must move to server-only API routes using `GEMINI_API_KEY`.
- Client-side prompts can be modified by users and can consume quota directly.
- There is no server-side request validation, rate limiting, or input normalization for symbols/ranges.
- Authentication is mocked and hardcoded to a pro account, so premium feature gates are cosmetic.
- The app currently relies on a public Yahoo proxy route without a clear allowlist of range/interval values.

## 5. Performance Issue

- Indicator, pattern, prediction, and backtest calculations run on the main browser thread.
- Screener scans a large symbol list sequentially with repeated network calls and no server cache.
- Chart rendering adds many overlays by default, which can be heavy on mobile and on screener cards.
- Auto-refresh re-fetches full historical ranges instead of only the latest candles.
- No memoized domain service layer exists to reuse parsed data across dashboard, portfolio, screener, and options.

## 6. UI/UX Issue

- The visual direction is already dark-terminal oriented, but layout density, responsiveness, and navigation consistency need improvement.
- There is no persistent educational/analytical disclaimer in the core flows.
- Empty states exist in some pages but not consistently across fetch failures, no results, partial data, or stale data.
- Loading states do not show exact source, symbol resolution, retries, or fallback status.
- The chart overlays are not user-toggleable, which makes the experience crowded.
- Options chain is labeled simulated in one table heading, but the AI panel can still read as predictive trading advice.

## 7. Financial Logic Issue

- Prediction is heuristic and named "AI" even when no AI model is used in the dashboard path.
- Confidence is mostly score magnitude plus fixed bonuses, not a calibrated probability.
- Backtesting only tests pattern occurrence with forward returns and lacks win rate by side, average return by strategy direction, max drawdown, risk/reward, sample-size quality, and fees/slippage assumptions.
- Paper trading lacks stop-loss/target simulation, order validation precision, portfolio allocation, current value by asset class, and robust realized/unrealized P&L helpers.
- Options max pain, IV, and OI-derived support/resistance are missing from real data and should not be inferred from random mock data for production claims.

## Missing Features Against Objectives

- Server-side market proxy with typed response contracts and retry/fallback metadata.
- Strong symbol resolver for NSE, BSE, MCX, global equities, indices, futures, forex, crypto, and aliases.
- Server-side Gemini prediction/chat endpoints.
- Reusable finance domain types and calculation services.
- Unit tests for indicators, resolver, backtesting, and portfolio math.
- User-facing stale/error/fallback states.
- Real or explicitly source-backed options chain integration.
- Watchlist, screener sector filters, and source confidence labels.
- Production authentication and persistence are out of scope for the current local-only app unless a backend is added.

## Refactor Priority List

1. Move sensitive AI calls and market-fetch orchestration to server routes.
2. Centralize domain types, symbol resolution, provider parsing, retry logic, and error responses.
3. Add robust indicator, trend, support/resistance, backtest, and portfolio calculation modules with tests.
4. Replace simulated options claims with clearly labeled synthetic mode plus deterministic analytics, or wire a real provider later.
5. Improve UI state handling: loading, empty, stale, retry, fallback, and educational disclaimer.
6. Tighten TypeScript and production config so builds fail on real errors.
7. Optimize screener and portfolio fetching with batching/caching and cancellation.

## File-wise Improvement Plan

- `package.json`: fix cross-platform build script, add test script and Vitest dependencies.
- `.env.example`, `README.md`, `INSTALL.md`: switch from `NEXT_PUBLIC_GEMINI_API_KEY` to server-only `GEMINI_API_KEY` and document educational disclaimer.
- `next.config.ts`: stop ignoring TypeScript build errors.
- `lib/types.ts`: add shared finance, symbol, indicator, backtest, prediction, and trading types.
- `lib/symbolResolver.ts`: implement Indian/global symbol alias normalization and fallback candidates.
- `lib/marketData.ts`: implement server-safe fetch, retry, Yahoo parsing, candle normalization, and metadata.
- `app/api/market/route.ts`: provide one typed market data endpoint for clients.
- `app/api/search/route.ts`: use resolver hints and normalized search results.
- `app/api/ai/chat/route.ts`, `app/api/ai/prediction/route.ts`: keep Gemini calls server-side and require `GEMINI_API_KEY`.
- `lib/dataFetcher.ts`: become a client-safe wrapper around `/api/market` plus CSV parser.
- `lib/indicators.ts`: add typed outputs, support/resistance, trend score, and safer insufficient-data handling.
- `lib/aiPrediction.ts`: rename/reshape heuristic logic as educational analysis and improve backtest metrics.
- `lib/portfolio.ts`: extract pure trading and portfolio math for tests.
- `lib/usePaperTrading.ts`: use pure helpers, add stop-loss/target fields and safer IDs.
- `components/StockChart.tsx`: add typed overlay rendering and support/resistance/Bollinger/VWAP toggles where practical.
- `components/Chatbot.tsx`, `app/options/page.tsx`: call server AI routes instead of Gemini directly.
- `app/page.tsx`, `app/screener/page.tsx`, `app/portfolio/page.tsx`: consume typed APIs, show better states, and reduce duplicated finance logic.
- `tests/`: add unit coverage for resolver, indicators, backtesting, and portfolio calculations.

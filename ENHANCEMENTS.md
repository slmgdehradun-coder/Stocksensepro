# StockSense Pro - Enhancement Notes

This documents seven passes: (1) a smarter, context-aware technical prediction engine
plus a full Docker deployment setup (2026-07-16), (2) a Fundamental Analysis module
(2026-07-17), (3) Market Cap/Altman-Z fixes, Magic Formula/Graham Number/Momentum Score,
and Sector Analysis (2026-07-18), (4) an enterprise-grade UI redesign of the
Fundamentals page (2026-07-19), (5) an app-wide design system, working mobile
navigation on every page, and a Dashboard visual pass (2026-07-19), (6) a
risk-reward bugfix and multi-target (T1/T2/T3) trade plan engine (2026-07-20), and (7)
an AuthModal layout bugfix and token migration (2026-07-20). Everything is additive and
backward compatible - no existing function signature lost its old behavior, only
gained an optional extra one.

## 1. Prediction engine (`lib/aiPrediction.ts`)

The engine previously scored a stock using only its own indicators/patterns/volume on a
single timeframe. It's now optionally aware of the broader market, and always applies a
few smarter, self-contained checks:

- **Market regime (NIFTY / Bank NIFTY / India VIX).** New `computeMarketRegime()` turns
  an index trend score + VIX level into `Risk-On` / `Risk-Off` / `Choppy` / `Neutral`.
  When supplied to `generateAIPrediction()`, a bullish setup gets a small score/confidence
  boost if the broader market is `Risk-On` (and vice-versa for bearish/`Risk-Off`); a
  setup that runs *against* the regime gets a risk note instead of being silently scored
  the same as one that has the market's backing. `Choppy` markets (elevated VIX) add an
  explicit position-sizing caution.
- **Multi-timeframe confluence.** Pass the weekly trend score (same `calculateIndicators`
  output, just computed on `'1wk'` candles) as `higherTimeframeTrend`. Agreement between
  the daily setup and the weekly trend adds conviction; disagreement doesn't flip the
  signal but does add an explicit counter-trend risk note.
- **Relative strength vs. benchmark.** New `computeRelativeStrength()` compares a stock's
  return to NIFTY's return over the same lookback window. A stock leading its benchmark
  on a bullish setup (or lagging on a bearish one) gets extra conviction; the opposite
  case is flagged rather than ignored.
- **False-breakout detection.** New `assessBreakoutRisk()` checks any breakout/breakdown
  through a support/resistance level for volume confirmation and rejection wicks, and
  flags it (`falseBreakoutRisk`) instead of trusting every level break equally.
- **Volatility-adjusted targets/stops.** ATR is now compared against its own recent
  history (`atrPercentile`); targets/stops widen automatically in the top 20% of recent
  volatility and tighten in the bottom 20%, instead of always using a fixed multiple.
- **Richer backtest statistics.** `backtestPattern()` now also returns `profitFactor`
  (gross win / gross loss, capped at 99) and `expectancy` (expected directional return
  per occurrence) alongside the existing win-rate/drawdown stats.
- **Confluence-based ranking, not just confidence.** `confluenceScore` is now a real
  composite (base signal strength, adjusted for breakout risk, risk-reward quality, and
  timeframe alignment) instead of being a duplicate of `abs(score)`. The AI Screener now
  sorts by this instead of raw `confidence`, matching the "rank by confluence, not just
  confidence" item from the project's own roadmap (section 26 of the technical docs).
- **Risk-reward is now surfaced as data**, not just a caution string: every prediction
  includes `riskRewardQuality: 'poor' | 'fair' | 'good'` so the screener/UI can filter or
  sort on it directly.

**Compatibility:** `generateAIPrediction(candles, patterns, indicators, backtestResults)`
called with no 5th argument produces *exactly* the same output as before (verified - see
Verification below). All new context is opt-in via a 5th `context?: PredictionContext`
parameter, and every new context factor only ever *adds* score in the direction the
technical setup already points - context can strengthen or flag a setup, it can never
flip a Buy into a Sell.

## 2. Wired into the app

- **Dashboard (`app/page.tsx`):** now fetches NIFTY + India VIX (cached 2 minutes across
  symbol switches) and the current symbol's weekly candles alongside the main lookup, and
  builds a `PredictionContext` from them. Best-effort: any fetch failure just means the
  prediction runs without that piece of context, exactly like before.
- **AI Screener (`app/screener/page.tsx`):** fetches NIFTY + VIX **once per scan** (not
  once per stock) and reuses that data to compute per-stock relative strength for free
  (no extra network calls). Results are now ranked by confluence score. A market-regime
  badge is shown at the top of the page, and a "⚠ Breakout Risk" badge appears on
  affected result cards.
- **`components/AIPredictionPanel.tsx`:** shows the new regime / multi-timeframe /
  relative-strength / breakout-risk badges when present.

## 3. Docker

New files: `Dockerfile`, `.dockerignore`, `docker-compose.yml`,
`docker-compose.durable.yml`, `.env.docker.example`, `DOCKER.md`, and
`app/api/health/route.ts`. `next.config.ts` now sets `output: 'standalone'`.

- **Default path** (`docker compose up -d --build`) runs a single container with the
  existing local JSON-file storage, persisted in a named volume.
- **Durable path** (`docker compose -f docker-compose.yml -f docker-compose.durable.yml
  up -d --build`) adds a real `redis` container plus
  [`serverless-redis-http`](https://github.com/hiett/serverless-redis-http), which
  exposes that Redis over the exact same REST protocol `lib/server/db.ts` already speaks
  for Vercel KV / Upstash - so durable storage works fully self-hosted with **zero code
  changes**. This directly addresses the "Add durable production DB before real users"
  item from the project's own roadmap, for people who don't want to depend on Vercel/Upstash.
- Multi-stage build produces a minimal runtime image (standalone Next.js server, pruned
  `node_modules`, non-root user, healthcheck against the new `/api/health` endpoint).

Full details, environment variable reference, and a backup command are in `DOCKER.md`.

## 4. Tests

Extended `tests/aiPrediction.test.ts` and `tests/backtest.test.ts` with coverage for:
context-omitted vs. context-`undefined` equivalence, timeframe alignment/conflict,
"context never flips the signal direction," `computeMarketRegime`,
`computeRelativeStrength`, and the new `profitFactor`/`expectancy` backtest fields.

## 5. Phase 2 - Fundamental Analysis module (2026-07-17)

Added a real, working fundamentals engine and a new `/fundamentals` page. This is a
deliberately scoped-down version of a much larger request (an "institutional-grade,
Bloomberg-Terminal-scale" fundamentals research assistant) - see the notes below on what
was intentionally left out and why.

**Data layer (`lib/server/fundamentals.ts`):**
- **US symbols:** SEC EDGAR's free, official XBRL `companyfacts` API is tried first (no
  key required) - ticker → CIK lookup via SEC's public `company_tickers.json`, then a
  fallback chain of US-GAAP tags per line item (e.g. revenue tries `Revenues`, then
  `RevenueFromContractWithCustomerExcludingAssessedTax`, then `SalesRevenueNet`, since
  taxonomy usage varies by filer). Live price/market cap (which EDGAR filings don't carry)
  is layered in from Yahoo Finance's lightweight quote, but statement figures are never
  blended across sources for the same ratio - one snapshot, one primary source, always
  recorded in `snapshot.source`.
- **Everything else (NSE/BSE/other):** Yahoo Finance's `quoteSummary` endpoint, same host
  and request pattern as the existing price fetcher.
- **Every field is optional and left `undefined` when the source doesn't have it** - no
  ratio, score, or Piotroski/Altman-Z criterion is ever guessed. Missing inputs show as
  "N/A" or "not evaluable" in the UI instead of a fabricated number.

**Scoring (`lib/fundamentalScore.ts`, pure functions, no network):**
- Standard ratio set: growth, margins, ROE/ROA/ROCE, D/E, current/quick ratio, interest
  coverage, PE/PB/PS/EV-EBITDA, dividend yield, free cash flow.
- **Piotroski F-Score** (9-point, standard formulation) - each criterion reports
  `true`/`false`/`null`, where `null` means "couldn't be evaluated from available data,"
  never a silent fail.
- **Altman Z-Score** (standard public-company formula) - returns `Unavailable` rather
  than a number when a required input (retained earnings, market cap, etc.) is missing.
- **Composite 0-100 scores** (Quality, Value, Growth, Financial Health, Overall) computed
  against fixed, documented bands - explicitly *not* claimed as a true peer-percentile
  rank, which would need a live cross-sectional database this doesn't have.

**Recommendation (`lib/fundamentalRecommendation.ts`):** blends the fundamental overall
score (70%) with the existing technical trend score (30%, optional) into a
Strong-Buy…Strong-Sell verdict with plain-English reasoning that references the actual
computed numbers, confidence that's explicitly discounted when data coverage is low, and
the same educational-only disclaimer used throughout the app.

**New route/page:** `app/api/fundamentals/route.ts` (6-hour in-process cache per symbol -
fundamentals change far slower than price data) and `app/fundamentals/page.tsx`
(Pro-gated via `ProGuard`, consistent with Screener/Options/Portfolio). Nav link added
across all pages.

**Verified the same way as Phase 1** (no working `next build`/`vitest` in this sandbox -
see section 13 below): `tsc --noEmit` passes with zero errors, and the compiled scoring
engine was run directly against a synthetic healthy company (9/9 Piotroski, Altman
"Safe", Strong Buy) and a synthetic distressed one (1/9 Piotroski, Altman "Distress",
Strong Sell), plus a sparse-data case confirming nothing gets fabricated when inputs are
missing. `tests/fundamentalScore.test.ts` covers the same scenarios as real vitest tests.

**Deliberately not built** (flagged before starting, per the original request's own
scope): scraping Moneycontrol/Screener.in/Trendlyne/TickerTape (no public APIs, scraping
breaks their ToS); shareholding-pattern tracking (no reliable free source for Indian
promoter/FII/DII breakdowns); 12-quarter trend tables; news sentiment analysis; macro
dashboard (rates/inflation/GDP/crude/Fed/RBI); ESG scores; full annual-report/earnings-
call NLP; true multi-year point-in-time fundamental backtesting (the historical restated
dataset this needs isn't available free anywhere). These remain open follow-ups if
wanted, ideally with API keys for Alpha Vantage/Finnhub/FMP/NewsAPI where a free-tier
integration would help.

## 6. Bugfix - "No fundamental data could be fetched" (2026-07-17)

**Root cause:** `lib/server/fundamentals.ts` called Yahoo Finance's `/v10/finance/
quoteSummary/` endpoint the same way the existing `/v8/finance/chart/` price fetcher
calls its endpoint - but unlike `chart`, `quoteSummary` has required a "crumb" (CSRF-style
token) plus a session cookie since Yahoo tightened access in 2024. Without it, Yahoo
returns an HTTP 401 "Invalid Crumb" response, which the original code treated as "no data"
with no further detail. This is a widely-documented, ongoing issue independent of this
app (see e.g. `gadicc/yahoo-finance2#764`, `ranaroussi/yfinance#1592`).

**Fix:** `fetchYahooQuoteSummary()` now:
1. Tries the request with no crumb first (still works in some regions/deployments).
2. On failure, fetches a session cookie from `fc.yahoo.com` (following redirects and
   collecting cookies at every hop, with a `finance.yahoo.com` fallback), exchanges it for
   a crumb at `/v1/test/getcrumb`, caches that session for 45 minutes, and retries with
   `?crumb=...` + the session cookie attached - the standard workaround used by yfinance
   and similar libraries.
3. If it still fails, the error message returned to the UI now includes the actual HTTP
   status/response snippet from the last attempt instead of a generic "unavailable"
   message, so any further failure is immediately diagnosable instead of opaque.

**Residual risk, stated plainly:** Yahoo has occasionally been reported to also block by
TLS fingerprint on some endpoints (a plain `fetch()` can't spoof a browser's TLS
handshake the way specialized HTTP clients can) - this fix resolves the specific,
confirmed cause (missing crumb) but if Yahoo is doing IP- or fingerprint-based blocking
on top of that for a given deployment, requests could still fail. If that happens, the
new diagnostic message will say so explicitly (an HTTP status other than 401, or a
non-JSON/HTML response body) rather than the old generic message - please share that
exact message if it comes up again, it'll point at the next fix directly.

## 7. Bugfix - Portfolio P&L always showing ₹0.00 (2026-07-18)

**Symptom reported:** a position's current price had moved, but the Portfolio page's P&L
column always showed exactly ₹0.00 / 0.00%.

**Root cause, two compounding issues:**

1. `Position` never recorded which exchange (NSE/BSE/US) it was bought on. When the
   Portfolio page refreshed prices, it had to *guess* the exchange from the symbol's
   string shape (`isGlobal ? 'GLOBAL' : 'NSE'`) - which is wrong for any bare US ticker
   (e.g. "AAPL" bought via the dashboard's US tab has no `.NS`/`.BO` suffix, so it was
   force-refetched as an NSE symbol and failed).
2. **The real symptom-matching bug:** whenever that price refetch failed for *any*
   reason, the code silently fell back to `currentPrices[pos.symbol] || pos.avgPrice` -
   which by construction makes `currentPrice - avgPrice = 0`, i.e. exactly ₹0.00 P&L,
   indistinguishable from "no price movement." The failure was logged to the browser
   console only; nothing in the UI indicated a price couldn't be fetched.

**Fix:**
- `Position` (and `TradeOrder`) gained an optional `exchange` field, populated at buy
  time from `stockData.metadata.exchange` (the exchange actually used to resolve the
  symbol) via `PaperTradingPanel` → `usePaperTrading.buy()`. Refreshing a position's
  price later reuses this instead of re-guessing.
- For positions saved *before* this field existed (`pos.exchange === undefined`), the
  Portfolio page now tries a second exchange as a self-healing fallback (NSE first, then
  US, or vice versa) instead of guessing once and giving up.
- **The silent-zero fallback is gone.** A position whose live price hasn't been fetched
  yet now shows an explicit "Unavailable" state (Current Price, Current Value, and P&L
  all show this, not a fabricated ₹0.00) with the underlying fetch error in a tooltip. A
  banner above the position list summarizes which symbols are affected. The "Sell All"
  button is disabled for a position with no live price, so a paper trade can no longer
  silently execute at a stale/wrong price.
- Portfolio-wide totals (Total Value, Unrealized P&L) still fall back to `avgPrice` for
  any one unpriced position, since an aggregate number can't be left undefined - this is
  documented in the code as a deliberate "assume no movement" approximation, distinct
  from the per-position display which now tells the truth.

**Verified the same way as the rest of this document** (no working `next build`/`vitest`
in this sandbox): compiled `lib/portfolio.ts` and ran it directly, confirming the
original two portfolio tests still pass unchanged, `exchange` is recorded and preserved
across averaging buys, and stays `undefined` (not crashing, not fabricated) for
positions bought without it. Added the same cases to `tests/portfolio.test.ts`. The
`useEffect`/rendering changes in `app/portfolio/page.tsx` are logic I traced by hand
against React's execution model rather than something this sandbox can mount and click
through - please confirm the Current Price/P&L columns now update correctly (or, if a
position still shows "Unavailable" after a minute, share what tooltip message it shows;
that will point at whatever's next).

## 8. Phase 3 - Market Cap fix, Magic Formula/Graham Number, and Sector Analysis (2026-07-18)

**Market Cap / Altman Z-Score "N/A" fix.** Root cause: for US stocks, live price and
market cap were filled in from Yahoo's crumb-gated `quoteSummary` endpoint only - if that
request failed (the same class of issue as section 6's bugfix, or a transient block),
Market Cap stayed blank, which cascaded into the Altman Z-Score ("needs market cap")
showing "Unavailable" even though SEC EDGAR had already supplied every other required
figure (revenue, EBIT, assets, liabilities, retained earnings). Fix: `lib/server/
fundamentals.ts` now fetches live price via the same reliable `/v8/finance/chart/` path
already used everywhere else in this app (Dashboard, Screener, Portfolio - proven not to
need a crumb), and computes `marketCap = price x sharesOutstanding` (shares come from
SEC's own XBRL `dei` facts) as the primary path, independent of `quoteSummary`.
`quoteSummary` is still tried afterward for the extras only it provides (sector,
industry, beta, dividend yield) but never overwrites a value the reliable path already
set. The same redundant fallback was added to the Yahoo-only (non-US) snapshot path too,
for any NSE symbol/module combination where `quoteSummary` comes back without a usable
market cap field.

**Two well-known valuation strategies added**, both computed only from data already in
`FundamentalSnapshot`, both returning `null`/`Unavailable` rather than a fabricated
figure when their inputs are missing:
- **Magic Formula (Joel Greenblatt)** - Earnings Yield (EBIT / Enterprise Value) combined
  with Return on Capital, each scored 0-100 against fixed bands. The original formula's
  Return-on-Capital leg uses (Net Working Capital + Net Fixed Assets) as the denominator;
  free data sources don't reliably expose that split, so the already-computed ROCE
  (EBIT / Capital Employed) is used as the closest available proxy - stated explicitly in
  the result's `detail` field rather than left implicit.
- **Graham Number (Benjamin Graham)** - `sqrt(22.5 x EPS x Book Value/Share)`, a
  conservative "don't overpay" reference ceiling from *The Intelligent Investor*, plus
  the resulting margin of safety versus the current price. Only computed when EPS and
  book value per share are both positive.
- **Momentum Score** - the existing technical trend engine's score (already fetched
  client-side for the blended recommendation) is now also surfaced as a fifth named
  composite score bar (0-100, rescaled from -100..100) alongside Quality/Value/Growth/
  Financial Health, and folds into `overallScore` when supplied. Omitting it reproduces
  the exact prior four-factor `overallScore` - purely additive.
- Beneish M-Score was considered and deliberately **not** added: it needs several inputs
  (PP&E, intangibles, SG&A across two periods) this snapshot doesn't reliably carry from
  free sources, and a mostly-"Unavailable" score adds little value - flagging this rather
  than shipping a token/partial implementation.

**Sector Analysis** (`lib/sectors.ts`, `lib/sectorAnalysis.ts`,
`app/api/sector-analysis/route.ts`, wired into `app/fundamentals/page.tsx`): a new
section on the Fundamentals page combining:
- **Technical**: the analyzed stock's sector is mapped to a verified NSE sectoral index
  (`^CNXIT`, `^CNXAUTO`, `^CNXPHARMA`, `^CNXFMCG`, `^CNXMETAL`, `^CNXENERGY`, `^NSEBANK`,
  `^CNXFIN` - each cross-checked against live Yahoo Finance pages before being hardcoded)
  or, for US stocks, the matching SPDR Select Sector ETF (XLK, XLF, XLV, XLY, XLP, XLB,
  XLE) via Yahoo's `assetProfile.sector` GICS label. The existing technical trend engine
  (`lib/indicators.ts`) runs on that index's daily candles to produce a Bullish/Bearish/
  Neutral read - the same pattern already used for the Phase 1 NIFTY/Bank NIFTY market
  regime feature, just parameterized per sector instead of hardcoded to the whole market.
  A sector with no verified index ticker (e.g. Defence, Consumer Tech - deliberately left
  unmapped rather than guessing one) shows peer comparison only, with an explicit reason
  instead of a silently blank technical section.
- **10-year sector performance**: the sector index's `'1mo'` timeframe (10y monthly
  candles - the exact same timeframe already used by the existing `/seasonality` page,
  no new fetch pattern introduced) is bucketed by calendar year for a yearly return list
  plus an annualized (CAGR) figure, with the current incomplete year excluded.
- **Month-wise sector behavior**: the existing `lib/seasonality.ts` engine (already
  covering month-wise NIFTY 50 / NIFTY Next 50 *stock* behavior at `/seasonality`) is
  reused directly on the sector index's monthly candles for a month-wise view of the
  *sector* itself, shown as a compact bar strip with best/worst month called out. The
  same component and underlying function are reused on the Fundamentals page to show the
  currently-analyzed stock's own 10-year month-wise behavior.
- **Fundamental peer comparison**: a small, curated peer list per sector (`nsePeers`/
  `usPeers` in `lib/sectors.ts`) has its fundamentals fetched and scored the same way as
  the main stock, then averaged into a sector-level "Fundamentally Strong/Average/Weak"
  read and shown as a comparison table (Overall score, P/E, ROE, revenue growth, verdict)
  with the analyzed stock highlighted. A peer whose data couldn't be fetched is excluded
  from the average rather than counted as zero - `peersEvaluated` vs `peersRequested`
  makes that gap visible instead of silently skewing the sector read.
- Everything here is cached in-process for 6 hours per sector (sector-wide data changes
  slowly), independent of the per-symbol fundamentals cache, so viewing multiple stocks
  in the same sector doesn't re-fetch the whole peer group and index history each time.

## 9. Fundamentals UI redesign - "Institutional Research Terminal" (2026-07-19)

Scope: `app/fundamentals/page.tsx` only (the page in active development in this
conversation), plus two small, deliberately-isolated shared-file additions
(`app/layout.tsx`, `app/globals.css`) needed to load two new fonts. No other page's
visual output changes as a result of this pass - see "Blast radius" below.

**Design direction.** The rest of the app uses a generic dark-SaaS look (slate grays,
Tailwind's default `blue-600`, default `emerald-400`/`rose-400`). For a fundamentals
research tool specifically, the brief calls for something closer to a real trading
terminal (Bloomberg/TradingView register) than a generic admin dashboard. The signature
choice: **every number on the page renders in a tabular monospace face** (IBM Plex Mono)
so columns of figures actually align - this is the single biggest visual tell of "real
financial terminal" versus "generic dashboard," and it's functional, not decorative
(real terminals do this for exactly this reason). Headings use Space Grotesk (a
geometric, slightly technical display face) instead of the default system sans. A
refined 6-color palette (ink `#0A0E13`, surface `#12181F`, border `#1F2730`, accent
teal `#24C0AC`, bull `#34B378`, bear `#E0525C`) replaces the generic slate/blue/emerald/
rose combination used elsewhere.

**Signature element:** a radial "Confluence Gauge" - an SVG progress ring around the
Overall Score in the verdict hero, replacing a plain number so the page's single most
important figure reads at a glance (color-coded to the same 65/40 quality bands used
throughout the scoring engine). Verified by hand rather than visually (no browser
available in this sandbox): circumference = 2πr; `strokeDashoffset = circumference *
(1 - score/100)` was checked against score=0 (offset=circumference, no visible arc),
score=100 (offset=0, full ring), and score=50 (offset=half circumference) - all correct.

**Mobile.** The app-wide header pattern (`hidden md:flex` on the nav, no fallback) means
every page currently has **zero navigation on mobile** - there's no hamburger menu
anywhere in the app, so a phone user can only reach other pages by editing the URL by
hand. Fixed for this page specifically: a working hamburger menu with a slide-down panel
listing all six nav links. The peer-comparison `<table>` (the widest element on the
page) uses `border-separate` + a `sticky left-0` first column so the symbol stays
visible while scrolling horizontally on narrow screens - `border-collapse` (the
default) is known to break sticky columns in some browsers, so the less-common
`border-separate` was used deliberately, not by accident. The loading state was upgraded
from a bare spinner to a skeleton layout matching the page's actual card structure.

**Accessibility quality floor.** Two places used `outline-none` without a replacement
focus indicator (the exchange `<select>` and the search input) - both were caught and
fixed with a visible `focus-visible:ring` / `focus-within:ring` before shipping, per the
"visible keyboard focus" bar this kind of pass should clear.

**A real mistake caught before shipping, worth recording:** the first draft used
`@theme { --font-display: var(--font-space-grotesk)... }` in `globals.css`. This looks
correct but silently fails - `next/font`'s CSS variables are set at runtime via a
`.variable` className on `<body>`, not known statically at Tailwind's CSS-compile time,
and plain `@theme` resolves theme values at build time. The fix is `@theme inline`
(confirmed against Tailwind's own docs and Next.js's official font-integration guide,
plus a tailwindlabs GitHub discussion of someone hitting exactly this bug) - without
`inline`, the fonts would have loaded (no error, no crash) but every `font-display`/
`font-data` utility would have silently rendered as the browser's default font instead,
the kind of bug that's very easy to ship unnoticed. Caught here by checking the specific
mechanism against current documentation rather than assuming the first plausible-looking
syntax was correct.

**Blast radius / what did NOT change:** `app/layout.tsx` only adds two new
`next/font/google` variable classes to `<body>` - it does not change `<body>`'s existing
`bg-[#0a0f1c]` class or remove anything. `app/globals.css` only adds new `--font-display`/
`--font-data` tokens - it does not touch Tailwind's default `--font-sans`/`--font-mono`,
which every other page's existing `font-sans`/`font-mono` classes still resolve to
exactly as before (checked: `app/page.tsx`, `screener`, `options`, `portfolio`,
`seasonality`, `strategies`, `admin`, `account`, `upgrade`, and several components all
reference `font-sans`/`font-mono`, none reference the new `font-display`/`font-data`
tokens, so none of them render any differently after this change). Dashboard, Screener,
Options, Portfolio, Seasonality, Strategies, Admin, and Account pages were **not**
redesigned in this pass - happy to extend the same design language to any of them next
if wanted, now that the token system exists to build from.

**Verified the same way as the rest of this document:** `tsc --noEmit` across the whole
project passes with zero errors after the rewrite. Since this page can't be rendered in
this sandbox (no `next dev`/browser), its JSX structure was additionally checked with a
scripted open/close tag-balance count across every major element type used on the page
(`div`, `span`, `table`, `thead`, `tbody`, `tr`, `form`, `nav`, `header`, `main`,
`select`) - all balanced. The underlying data/state/effects logic is untouched from the
already-tested version (see sections 5 and 8) - this pass only changed the JSX markup
and className strings around that logic, not the logic itself. **Not verified:** actual
visual rendering, color contrast in a real browser, and font loading behavior end-to-end
- please open the page and flag anything that looks visually off; that's the one class
of bug this process genuinely cannot catch on its own.

## 10. App-wide UI enhancement - design system, mobile nav, Dashboard (2026-07-19)

This follows directly from section 9's own "what did NOT change" list, which flagged
that every other page still had zero mobile navigation and the generic slate/blue
palette. This pass addresses that app-wide.

**New shared design system (`app/globals.css`).** A second, app-wide token system -
distinct from and parallel to the Fundamentals page's own bespoke teal palette from
section 9, which is left completely untouched (see "Two accent zones" below). Named
around a trading-terminal heritage rather than a generic SaaS blue: a near-black navy
base (`--color-ink #0a0e16`), a terminal-amber accent (`--color-accent #e3a23b`), and the
existing emerald/rose convention **kept** for gains/losses - that convention is
domain-correct (every financial tool uses it), not a lazy default, and changing it would
make the app harder to read against every other tool a trader already uses. Amber was
chosen specifically so the brand accent never collides with the bullish/bearish
semantic colors the way reusing emerald or rose as "the accent" would have.
Component classes (`.surface-card`, `.badge` + 5 variants, `.signal-underline` - a
recurring thin amber trace used on active nav items) reduce repetition across pages.
Accessibility basics added at the base layer: visible `:focus-visible` rings app-wide
(nothing suppresses focus outlines), `prefers-reduced-motion` support, and a slim
custom scrollbar.

**A real naming collision caught before it shipped:** the first draft of the token
system defined `--radius-sm/md/lg` to create a custom corner-radius scale. Tailwind v4
auto-generates a `rounded-<name>` utility per `--radius-<name>` token - but Tailwind's
*default* theme already defines `--radius-sm/md/lg` internally for the built-in
`rounded-sm`/`rounded-md`/`rounded-lg` utilities. Defining the same names would have
silently overridden their default pixel values app-wide, resizing the 40+ existing
`rounded-md`/`rounded-lg` elements across every untouched page the moment this file
loaded - not a typo-shaped bug, a same-name-different-owner bug. Caught by grepping for
existing usage counts before finalizing the token names, not by any compiler (Tailwind
doesn't warn about this). Fixed by dropping the custom radius scale entirely and reusing
Tailwind's own default `rounded-lg`/`rounded-xl`/`rounded-2xl` throughout instead - one
consistent scale, zero collision risk. A second, smaller version of the same class of
mistake - naming a text-color token `--color-text-primary`, which auto-generates the
awkward, easy-to-mistype `text-text-primary` utility - was caught immediately after
writing the first component and renamed to `--color-fg` (-> `text-fg`) before it could
spread to a second file.

**`components/AppHeader.tsx` - the highest-value fix in this pass.** Every page's nav
used `hidden md:flex` with no fallback, meaning the app had no way to navigate on a
phone screen other than editing the URL by hand (confirmed and flagged already in
section 9). One shared header component now replaces all ten pages' individually
copy-pasted header markup: a working hamburger menu with a slide-down panel on mobile,
active-link highlighting driven by `usePathname()` (the real URL) instead of each page
hardcoding which of its own links should look active, and a single place that owns
sign-in/account/logout UI instead of ten slightly-diverging copies. Rolled out to all
ten pages (Dashboard, Screener, Options, Portfolio, Seasonality, Strategies, Admin,
Account, Upgrade, Fundamentals) plus `error.tsx`/`not-found.tsx`, with each page's
now-redundant header JSX, dead auth-modal state, and unused icon imports removed and
re-verified with `tsc --noEmit` after every single file. Pages that trigger a sign-in
prompt from body content (not just the header) - Screener's Pro-gated strategy filter,
Admin's session-expiry handling, Upgrade's payment flow - kept their own independent
`<AuthModal>` instance for that specific case; `AppHeader` owns a separate instance for
header-triggered sign-in, and the two never conflict since only one is ever open.

**Two accent zones, by design, not by oversight.** The Fundamentals page's existing
teal-accented "institutional terminal" look from section 9 (133 hand-chosen hex values,
the radial Confluence Gauge, its own mobile nav) was **not** recolored to match the new
amber system - only its header block was swapped for `AppHeader`, which also fixes a
real functional gap that page had: its old header carried zero auth UI at all (no
sign-in button, no account link, no upgrade CTA - a user landing directly on
`/fundamentals` had no way to sign in). Migrating 133 already-correct, already-polished
hardcoded values to a differently-named token system for the sake of consistency alone
would have been pure churn against working code, for a page that already reads as more
finished than a mechanical recolor would produce. The app now intentionally has one
consistent amber-accented chrome (header/nav, identical on every page) wrapping two
content zones with their own character: the Fundamentals page's teal terminal look, and
the amber-accented look applied to the rest.

**Dashboard (`app/page.tsx`) visual pass**, as the app's landing page: a new hero
section above the symbol quick-picks (headline, subhead, an "AI-Powered Analysis"
badge) where the page previously jumped straight into stock-symbol chip buttons with no
framing at all; the quick-pick chips, stock header, live/manual badge, chart card
chrome, and both Pro-upsell panels migrated to the new tokens. One deliberate
exception: the technical chart's EMA/SMA legend dot colors (blue/yellow/purple/orange)
were left as literal Tailwind colors rather than migrated to the brand palette, because
they must stay in sync with the actual line colors `StockChart.tsx` draws on the
canvas - recoloring the legend without also changing the untouched charting component
would have made the legend lie about what's on the chart, so this was left alone with a
comment explaining why, rather than "fixed" incorrectly.

**Not done in this pass** (flagged rather than silently skipped, consistent with every
prior section of this document): Screener, Options, Portfolio, Seasonality, Strategies,
Admin, Account, and Upgrade all now share the new header/mobile-nav and base
background/text tokens (since those live in `app/globals.css`'s `body` rule and cascade
everywhere), but their own card-level content still uses the prior slate/blue palette -
only the Dashboard and (from section 9) Fundamentals got a full content-level visual
pass. Extending the same treatment to the remaining pages is a reasonable next step if
wanted; the token system and component classes now exist to build every one of them
from.

**Verified the same way as the rest of this document, with one added technique this
pass specifically needed.** This sandbox cannot run `next dev`, open a browser, or even
compile the actual CSS - `@tailwindcss/postcss` depends on `lightningcss`, a native
Rust binary, and the copy in this project's `node_modules` is `win32-x64`-only (the same
platform-lock noted in the very first entry of this document, for a completely
different native dependency). So beyond the usual `tsc --noEmit` (clean, zero errors,
re-run after every single file edit in this pass), every custom Tailwind class
introduced was cross-checked programmatically against the tokens actually declared in
`globals.css` - twice: once by hand early on, and once with a small Python script at the
end that re-parses every `--color-*`/`--font-*`/`--shadow-*` declaration and every
`bg-*`/`text-*`/`border-*`/`from-*`/`to-*` class across all eight touched files,
confirming zero mismatches (i.e. zero typo'd or undeclared token references anywhere in
this pass's output) - the kind of check that catches exactly the class of bug a CSS
compiler would normally catch instantly, done manually because the compiler isn't
available here. **Not verified, and cannot be verified in this environment:** actual
visual rendering, color contrast in a real browser, whether the new hero section reads
well at a glance, and whether anything looks visually "off" in a way that only shows up
on screen. Please open the app and flag anything that looks wrong - that is the one
category of bug this whole process cannot catch on its own, in this pass or any other.

## 11. Bugfix - inverted risk-reward (target too close, stop too far) + multi-target trade plan (2026-07-20)

**Real bug, correctly diagnosed by the user, not a misunderstanding.** The target/stop
generator (`directionalRiskLevels` in `lib/aiPrediction.ts`) took a matched resistance
level as the target and a matched support level as the stop directly, with no bound on
either relative to the other. In a common, realistic setup - a minor resistance sitting
1-2% above entry with the nearest real support sitting well further below - this
produced exactly the complaint: a 2-3% target against a much larger stop, a risk-reward
worse than 1:1. The code already computed a `riskRewardRatio` and added a caution note
when it was poor, but never corrected the actual numbers - the note was easy to miss
next to a still-generated Buy/Sell signal with concrete price levels attached.

**Fix: replaced the single-target function with `buildTradePlan()`**, which produces a
stop-loss and three staged targets (T1/T2/T3) with a structural, load-bearing
guarantee - not a suggestion, a construction: T1 is never closer than 1R, T2 never
closer than 2R, T3 never closer than 3R, where "R" is this specific setup's actual
risk (entry-to-stop distance), not a fixed percentage. This is the exact discipline
professional risk management is built on - Van Tharp's R-multiple framework, Mark
Minervini's stated 2:1 minimum before taking a trade, Paul Tudor Jones' publicly
described 5:1 asymmetry rule ("if I have a 5:1 risk/reward, I only need to be right
20% of the time to break even"). A resistance/support level still informs where a
target sits *when it's beyond that tier's minimum* - a real technical level is more
informative than an arbitrary ATR multiple - it just can never pull a target inside the
floor or push the stop past a sane ceiling. The stop's own distance is itself bounded to
0.8-2.2x ATR so a distant support level can no longer blow the stop out arbitrarily far,
which was the other half of the original complaint.

**Multi-target output, not just a fixed number**, because a single target/stop pair is a
poor match for how the traders the person asked to emulate actually manage a position:
`prediction.tradePlan` now carries `stopLoss`, `riskPerShare` (the 1R unit), and
`target1`/`target2`/`target3`, each with its price, R-multiple, and a plain-English
scale-out instruction (book 40-50% at T1 and move the stop to breakeven, another 30-40%
at T2, trail the remainder toward T3) - the staged-exit technique taught at prop desks
and in Minervini's SEPA methodology, not a fixed all-in/all-out target. `targetPrice` /
`stopLoss` stay on the output (now sourced from T2's stop/price) so every existing
caller keeps working unchanged; `AIPredictionPanel.tsx` now renders the full T1/T2/T3
breakdown when `tradePlan` is present, and the Screener's compact result cards show the
main target's R-multiple inline.

**Verified against the exact adversarial case described** - a synthetic setup with
resistance 1% above entry and support 15% below (the precise shape of the complaint) -
confirming T2's R-multiple is still ≥2.0 and the stop distance stays under 5% rather
than being dragged out to the distant support. Also verified: correct mirrored ordering
for bearish setups, the guarantee still holds with zero support/resistance levels
present (pure-ATR fallback), and every existing test scenario's directional assertions
(target above/below entry as appropriate) still pass unchanged - the values differ from
before because the underlying math is now more disciplined, not because anything broke.
25 new assertions added across `tests/aiPrediction.test.ts` covering all of the above.

## 12. Bugfix - AuthModal appearing "half cut off" on open, plus token migration (2026-07-20)

**Reported via screenshot of the live deployment:** opening the sign-in modal showed
only its middle/bottom portion (password hint, disclaimer, Google section, submit
button) with the name/email/password fields above the fold seemingly missing.

**Root cause:** the modal always rendered a full Google Sign-In UI block - a section
divider, a disclaimer checkbox, and (since this deployment has no
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` configured, confirmed in the same screenshot) a large
amber warning box telling the user Google Sign-In is disabled - regardless of whether
Google Sign-In was even available. That's substantial vertical space spent, on every
single open, on a feature the end user has no way to enable themselves. Combined with a
`max-h-[92vh]` scrollable container, this pushed the actually-usable content down far
enough that on a modest browser window it looked broken rather than merely scrollable.

**Fix, in `components/AuthModal.tsx`:**
- The entire Google section (divider, checkbox, and either the real button or the
  warning box) now only renders when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is actually
  configured - there is nothing useful to show an end user about a feature only the
  site operator can enable, so nothing is shown.
- The "Free by default / Admin-approved Pro" info panel now only renders during
  signup, not login - it's onboarding context a returning user doesn't need, and
  skipping it shortens the far more common login path significantly.
- Added a scroll-reset effect that scrolls the modal to the top on every open and on
  every login/signup mode switch, as a second, independent safeguard against the modal
  ever appearing to open "mid-scroll" regardless of the exact cause.
- Fixed a real, separate checkbox-styling bug found while making these changes: the
  checkboxes used a `text-*` utility to try to tint their native checked-state fill,
  but that only affects text color, not a checkbox's fill - the correct CSS property is
  `accent-color`, now applied via Tailwind's `accent-*` utility.

**Also migrated this component to the design tokens from section 10** (`bg-ink`,
`text-fg`, `text-accent`, etc.) while working in this file, since it's one of the most
visible components in the app - every visitor sees it. Caught and fixed a contrast bug
in the same pass: the submit button's background became the amber accent color but was
initially left with light (`text-fg`) text from a mechanical find-and-replace, which
would have been low-contrast and hard to read - corrected to dark (`text-ink`) text,
matching every other amber-filled button already in the design system.

**Verified:** `tsc --noEmit` clean; a scripted div-balance check (open/self-closing vs.
closing tag counts) confirms the JSX is structurally sound after the edits; every
custom Tailwind token class in the file was cross-checked against `globals.css`'s
declared tokens, with zero mismatches. As with the rest of the app-wide UI pass, actual
visual rendering could not be confirmed in this sandbox - please check the modal on the
live deployment after this update ships and confirm the fields are visible on open.

## 13. Verification (and its limits)

This environment could not run `pnpm install`, `next build`, or `vitest` directly: the
uploaded project's `node_modules` was installed on Windows (all native binaries -
`@next/swc-*`, `@rolldown/binding-*`, `@img/sharp-*` - are `win32-x64` only) and this
sandbox has no network access to fetch Linux equivalents. This is not a problem for you
running it locally or via Docker (Docker does a completely fresh, correct-platform
install), but it means the following was verified differently:

- **`tsc --noEmit` across the whole project passes with zero errors**, including every
  changed file and call site, after reconstructing a working local `node_modules` link
  tree by hand (the archive's pnpm symlinks were flattened during export/zip, independent
  of the Windows/Linux issue).
- **Runtime-verified by compiling the changed `lib/` files to plain JS with `tsc` and
  executing them with plain `node`** (bypassing the platform-locked `vitest`/`next`
  binaries): reproduced both original test scenarios exactly, plus every new test case
  added in step 4, plus edge cases (very short candle histories, insufficient candles for
  relative strength, an all-losing backtest pattern). All passed.
- **Phase 3 specifically**: `computeMagicFormula`, `computeGrahamNumber`, momentum-score
  blending, `calculateYearlyPerformance`, `buildSectorTechnicalAnalysis` (bullish/
  bearish/sparse-data cases), `resolveSectorForStock`, and `aggregateSectorFundamentals`
  were all runtime-verified the same way, including the Graham Number result matching a
  hand-computed value (`sqrt(22.5 x 2 x 6) ≈ 16.43`) rather than just "runs without
  throwing." Since `app/fundamentals/page.tsx` can't be rendered in this sandbox (no
  `next dev`/browser available), its JSX was additionally checked with a scripted
  open/close `<div>` tag count across the whole file (77 opens, 2 self-closing, 75
  closes - balanced) after a `str_replace` edit that initially left one `<div>` and one
  `)}` unclosed; that specific issue is now fixed and the balance is confirmed even
  though the visual layout itself is still unverified against a real browser - please
  flag anything that looks visually off.
- **Not verified here:** the actual `next build` / `next dev` compile, ESLint (a required
  transitive package was missing from the store entirely, not just unlinked), and the
  Docker image build itself (no Docker daemon or network in this sandbox). The Dockerfile
  follows the standard, well-documented Next.js `output: 'standalone'` multi-stage
  pattern; please run `docker compose up -d --build` (or `pnpm install && pnpm test &&
  pnpm build` locally) as a final check before deploying.

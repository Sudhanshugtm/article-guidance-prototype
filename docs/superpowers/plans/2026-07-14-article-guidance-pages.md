# Article Guidance GitHub Pages implementation plan

> Approved scope: standalone ProtoWiki/Codex prototype, real public Wikimedia APIs, bundled outlines, no backend, and faithful phone/desktop rendering.

## 1. Lock the behavior with focused tests

Use Node's built-in test runner for the pure search-presentation and outline-matching modules. First observe failures for missing modules, then implement the smallest functions that satisfy the two-stage loading sequence, post-resolution fallback boundary, stable result ordering/limits, direct/hierarchy match merging, and specificity selection.

## 2. Build the browser search client

Port the current Wikidata search, entity enrichment, hierarchy query, and result mapping into typed browser modules. Add a shared AbortSignal, 20-candidate cap, 8-second Action API and 15-second WDQS attempt timeouts, one 429/5xx retry, Wikimedia request headers, page caches, the English Wikipedia title-existence check, and Commons thumbnail generation. Bundle the local 48-outline response as a reduced static snapshot.

## 3. Build the responsive Article Guidance route

Create `/article-guidance` with `ChromeWrapper`, Codex input/progress/message/card/button/icon components, the exact 300 ms debounce and 2 second escalation lifecycle, real result rendering, post-resolution footer, inline outline picker, retry handling, query-parameter initialization, and mobile/desktop styles derived from the local surface. Redirect `/` to the route while retaining query parameters.

## 4. Verify locally

Run tests, type check, lint, and a production build using `/article-guidance-prototype/` as the base. Use the external Playwright harness in `/Users/sshugautam/.claude/skills/playwright-skill` for visible mobile and desktop checks; it needs no repository dependency. Intercept requests for controlled delayed, retry, and stale-response states, then run one real public query. Compare 360 × 640 and 1366 × 900 screenshots and measured geometry with the exact local `?v=messages-post` references recorded in the design spec.

## 5. Publish and verify

Commit intentionally, fast-forward the reviewed branch to `main`, push, grant the deployment workflow write permission, configure Pages to serve the generated `gh-pages` branch, wait for deployment, and verify the stable public URL on mobile and desktop before handoff.

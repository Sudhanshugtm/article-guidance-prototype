# Article Guidance public prototype design

## Goal

Publish the approved T431532 `messages-post` Article Guidance exploration as a static, backend-free prototype that people can use on phones and desktops. The public version must preserve the local prototype's visual hierarchy and message sequencing while accepting arbitrary search queries and returning current Wikidata-backed results.

## Product contract

- Start with the title from `newarticletitle`, then `q`; default to `Jaipur`. Input edits replace `newarticletitle` in the URL without adding browser-history entries so a copied link restores the current query.
- Debounce typing for 300 ms and cancel stale requests.
- During a live request, show a spinner beside `Checking for a matching subject`.
- If the same request is still pending after 2 seconds, replace that line with `Still checking. This may take a moment.`
- Remove the trailing ellipsis because the spinner already communicates activity.
- Never show `Subject unavailable? Pick a type instead` while loading.
- When the request resolves, cancel the escalation timer and show real results, no results, or an error. Then show the type-picker footer.
- Rank supported subjects first, keep at most three unsupported subjects, and show at most eight results.
- `Pick a type instead` opens a bundled snapshot of the 48 Article Guidance outline types and Back restores the search results.
- Use the viewport-responsive ProtoWiki Vector/Minerva shell. `?skin=mobile` and `?skin=desktop` remain available for forced reviews.

## Runtime architecture

The site is a Vite/Vue 3 static application deployed by GitHub Pages. It has no server or private credentials.

The browser calls public CORS-enabled Wikimedia endpoints directly:

1. Wikidata Action API full-text search for candidate entities.
2. Wikidata `wbgetentities` for labels, descriptions, images, sitelinks, and matching claims.
3. Wikidata Query Service for hierarchy matching against Article Guidance outline types.
4. English Wikipedia Action API to determine whether the typed title already exists.

The Article Guidance outlines endpoint is not publicly deployed, so the current local 48-outline response is stored as a static JSON snapshot. Requests use an identifying `Api-User-Agent`, AbortController cancellation, bounded retry for transient failures, and page-scoped caches.

Matching mirrors the Article Guidance implementation. Candidates preserve Wikidata search order. Outlines are grouped by `matchVia` (`P31` for the default group); direct property matches and hierarchy matches are de-duplicated; any non-default strategy such as `P106` wins over default `P31`; within that strategy only outlines with the greatest configured `hierarchyDepth` survive. Supported and unsupported groups each retain their candidate order before the supported-first, 3-unsupported, 8-total display limits are applied. Disambiguation, list, template, and category items use the extension's four configured exclusion QIDs.

Each search is capped at 20 candidates. Action API requests have an 8-second attempt timeout and hierarchy requests a 15-second attempt timeout. Only 429 and 5xx responses retry once; the retry observes `Retry-After` when present. The query has one AbortController shared by all downstream calls, and a newer query invalidates the older request even if a remote service finishes late.

Hierarchy matching is required for the supported/unsupported distinction. If WDQS still fails after its bounded retry, the whole search resolves to the explicit error state rather than presenting unclassified candidates as trustworthy matches.

The English Wikipedia title check retains the local presentation rule: zero Wikidata matches becomes `No subjects found for “…”` only when the typed page title is confirmed missing. If the page exists, the matching result path owns the UI; an indeterminate existence check does not manufacture a no-result claim.

## Interface

The Article Guidance surface uses Codex components and tokens inside `ChromeWrapper`:

- responsive `New article` step header;
- serif, underlined title input;
- accessible polite live-status region for the two loading messages;
- `What is this?` result heading and Codex cards with thumbnail, title, matched type, and description;
- post-resolution type-picker footer;
- inline type list with a Back control.

The root route redirects to `/article-guidance` while preserving query parameters, so the repository's Pages URL is immediately usable and shareable.

This focused prototype ends at subject/type selection. Result-card activation opens the corresponding Wikidata item in a new tab so reviewers can inspect the live source. Outline-card activation marks that type as selected locally and announces the selection; it does not simulate later Article Guidance steps.

The behavior source is the July 14, 2026 `t431532-master` worktree based on `6e031c0cb32b879781fab0dc642f11e5a5f684ad`, specifically `SearchStep.vue`, `SearchStatus.vue`, `utils/searchPresentation.js`, `composables/outlineMatching.js`, `api/Wikidata.js`, `api/Sparql.js`, and their focused tests under `tests/jest/`.

## Failure and accessibility behavior

- Empty input returns to idle without a request.
- Aborted/stale requests never overwrite a newer query.
- Transient 429/5xx failures retry twice, respecting `Retry-After` when available.
- Final failure shows `Couldn't check this subject.` and a `Try again` action.
- Status updates use `role="status"`, `aria-live="polite"`, and `aria-atomic="true"`.
- Cards and type choices are keyboard reachable; focus treatment uses Codex progressive tokens.
- Reduced-motion users do not receive decorative transitions.

## Acceptance checks

- Unit tests cover presentation sequencing, result limits/order, and outline-match specificity.
- Browser checks use request interception and controlled delays for initial loading, the 2,000 ms escalation, footer absence/presence, retry, stale-response rejection, and type-picker navigation; a separate non-mocked check confirms an arbitrary live query.
- Visual checks use the exact local `?v=messages-post` route at 360 × 640 and 1366 × 900. Reference geometry is: mobile root 360 px, input x=16/w=328, status x=16 with label x=52; desktop root x=159/w=1024, input x=159/w=640, status x=159/w=448 with label x=193.
- Type check, lint, test, and the GitHub Pages-base production build all pass.
- The deployed Pages URL is opened and verified after the workflow completes.

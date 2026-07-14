# Article Guidance prototype

A public, backend-free prototype of the T431532 Article Guidance `messages-post` exploration.

Try it at [sudhanshugtm.github.io/article-guidance-prototype](https://sudhanshugtm.github.io/article-guidance-prototype/). The title field accepts any query and uses current Wikidata results. The responsive shell switches automatically between mobile and desktop; append `?skin=mobile` or `?skin=desktop` to force either view.

The loading sequence is intentionally narrow:

1. `Checking for a matching subject`
2. After two seconds, `Still checking. This may take a moment.`
3. Real results, no results, or an error
4. Only after resolution: `Subject unavailable? Pick a type instead`

The site is built with Vue 3, [Wikimedia Codex](https://doc.wikimedia.org/codex/latest/), and [ProtoWiki](https://github.com/wikimedia/ProtoWiki). It calls public Wikimedia APIs directly from the browser and bundles a static snapshot of the 48 Article Guidance types; it has no application backend.

## Local development

```bash
npm ci
npm run dev
```

Verification:

```bash
npm test
npm run type-check
npm run lint
PROTOWIKI_BASE=/article-guidance-prototype/ npm run build
```

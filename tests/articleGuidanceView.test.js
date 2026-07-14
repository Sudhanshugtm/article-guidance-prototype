import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const componentSource = await readFile(
  new URL('../src/prototypes/article-guidance/index.vue', import.meta.url),
  'utf8',
)

function cssRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = componentSource.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))
  assert.ok(match, `Expected CSS rule for ${selector}`)
  return match[1]
}

test('offers a visible Back action inside the desktop type picker', () => {
  assert.match(
    componentSource,
    /class="ag-outlines__desktop-back"[\s\S]*?@click="hideOutlines"/,
  )
  assert.match(cssRule('.ag-outlines__desktop-back'), /display:\s*none/)
  assert.match(
    cssRule(".ag-prototype[data-skin='desktop'] .ag-outlines__desktop-back"),
    /display:\s*inline-flex/,
  )
})

test('moves focus into the picker and restores it to the initiating action', () => {
  assert.match(
    componentSource,
    /ref="outlineHeading"[\s\S]*?tabindex="-1"/,
  )
  assert.match(componentSource, /ref="browseTrigger"/)
  assert.match(
    componentSource,
    /function browseOutlines[\s\S]*?outlineHeading\.value\?\.focus\(\)/,
  )
  assert.match(
    componentSource,
    /function hideOutlines[\s\S]*?browseTrigger\.value\?\.button\?\.focus\(\)/,
  )
})

test('renders result type metadata with an opaque AA-oriented token', () => {
  const rule = cssRule('.ag-card__separator,\n.ag-card__outline')
  assert.match(rule, /color:\s*var\(--color-subtle\)/)
  assert.doesNotMatch(rule, /opacity:/)
})

test('allows arbitrary no-result queries to wrap within the viewport', () => {
  assert.match(cssRule('.ag-state-message'), /overflow-wrap:\s*anywhere/)
})

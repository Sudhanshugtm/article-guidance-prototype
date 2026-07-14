import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveSearchPresentation,
  selectVisibleResults,
} from '../src/prototypes/article-guidance/searchPresentation.js'

test('keeps the escape path out of both loading stages', () => {
  assert.deepEqual(
    resolveSearchPresentation({ hasQuery: true, loading: true, stage: 'checking' }),
    {
      kind: 'loading',
      message: 'Checking for a matching subject',
      showBrowseFallback: false,
    },
  )

  assert.deepEqual(
    resolveSearchPresentation({ hasQuery: true, loading: true, stage: 'longer-wait' }),
    {
      kind: 'loading',
      message: 'Still checking. This may take a moment.',
      showBrowseFallback: false,
    },
  )
})

test('shows the escape path only after a request resolves', () => {
  assert.equal(
    resolveSearchPresentation({ hasQuery: true, loading: false, resultCount: 2 }).kind,
    'results',
  )
  assert.equal(
    resolveSearchPresentation({ hasQuery: true, loading: false, resultCount: 2 })
      .showBrowseFallback,
    true,
  )
  assert.deepEqual(
    resolveSearchPresentation({
      hasQuery: true,
      loading: false,
      resultCount: 0,
      articleExists: false,
    }),
    { kind: 'no-results', showBrowseFallback: true },
  )
  assert.equal(
    resolveSearchPresentation({ hasQuery: true, loading: false, error: true }).showBrowseFallback,
    true,
  )
})

test('returns to idle for an empty title', () => {
  assert.deepEqual(resolveSearchPresentation({ hasQuery: false }), {
    kind: 'idle',
    showBrowseFallback: false,
  })
})

test('orders supported results first and limits unsupported and total results', () => {
  const results = [
    { id: 'u1', supported: false },
    { id: 's1', supported: true },
    { id: 'u2', supported: false },
    { id: 's2', supported: true },
    { id: 'u3', supported: false },
    { id: 'u4', supported: false },
    { id: 's3', supported: true },
    { id: 's4', supported: true },
    { id: 's5', supported: true },
    { id: 's6', supported: true },
  ]

  assert.deepEqual(
    selectVisibleResults(results).map((result) => result.id),
    ['s1', 's2', 's3', 's4', 's5', 's6', 'u1', 'u2'],
  )
})

test('never exposes more than three unsupported results', () => {
  const results = [
    { id: 's1', supported: true },
    { id: 's2', supported: true },
    { id: 'u1', supported: false },
    { id: 'u2', supported: false },
    { id: 'u3', supported: false },
    { id: 'u4', supported: false },
  ]

  assert.deepEqual(
    selectVisibleResults(results).map((result) => result.id),
    ['s1', 's2', 'u1', 'u2', 'u3'],
  )
})

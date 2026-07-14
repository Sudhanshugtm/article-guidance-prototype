import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyHierarchyMatches,
  collectDirectMatches,
  groupOutlinesByMatchVia,
  propForGroup,
  selectBestMatches,
} from '../src/prototypes/article-guidance/outlineMatching.js'

test('groups outlines by their matching property', () => {
  assert.deepEqual(
    groupOutlinesByMatchVia([
      { articleType: 'Q1', matchVia: null },
      { articleType: 'Q2', matchVia: 'P106' },
      { articleType: 'Q3', matchVia: 'P106' },
    ]),
    { default: ['Q1'], P106: ['Q2', 'Q3'] },
  )
  assert.equal(propForGroup('default'), 'P31')
  assert.equal(propForGroup('P171'), 'P171')
})

test('combines direct and hierarchy matches without duplicates', () => {
  const matches = {}
  collectDirectMatches(
    matches,
    ['Q10'],
    { default: { Q10: new Set(['Q1']) }, P106: { Q10: new Set(['Q2']) } },
    new Set(['Q1', 'Q2']),
  )
  applyHierarchyMatches(matches, {
    default: { Q10: new Set(['Q1', 'Q3']) },
    __excluded__: { Q10: new Set(['Q999']) },
  })
  assert.deepEqual(matches, { Q10: ['Q1', 'Q2', 'Q3'] })
})

test('ignores direct values that are not configured outline types', () => {
  const matches = {}
  collectDirectMatches(
    matches,
    ['Q10'],
    {
      default: { Q10: new Set(['Q1', 'Q999']) },
      P106: { Q10: new Set(['Q1']) },
    },
    new Set(['Q1']),
  )
  assert.deepEqual(matches, { Q10: ['Q1'] })
})

test('prefers non-default matching and then the deepest outline', () => {
  const outlines = [
    { articleType: 'Q5', matchVia: null, hierarchyDepth: 50 },
    { articleType: 'Q100', matchVia: 'P106', hierarchyDepth: 10 },
    { articleType: 'Q200', matchVia: 'P106', hierarchyDepth: 20 },
  ]
  assert.deepEqual(selectBestMatches({ Q42: ['Q5', 'Q100', 'Q200'] }, outlines), {
    Q42: ['Q200'],
  })
})

test('keeps only the deepest outline within the default strategy', () => {
  const outlines = [
    { articleType: 'Q1', matchVia: null, hierarchyDepth: 3 },
    { articleType: 'Q2', matchVia: null, hierarchyDepth: 7 },
    { articleType: 'Q3', matchVia: null, hierarchyDepth: 5 },
  ]
  assert.deepEqual(selectBestMatches({ Q42: ['Q1', 'Q2', 'Q3'] }, outlines), {
    Q42: ['Q2'],
  })
})

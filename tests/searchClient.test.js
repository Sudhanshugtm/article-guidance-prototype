import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ACTION_API_TIMEOUT_MS,
  WDQS_TIMEOUT_MS,
  checkPageExists,
  clearSearchCache,
  fetchJsonWithRetry,
  searchSubjects,
  searchWikidataCandidates,
  wikimediaRequestHeaders,
} from '../src/prototypes/article-guidance/searchClient.js'

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

test('builds the Wikidata search request and caps candidates at 20', async () => {
  let requestUrl
  const fetchImpl = async (url) => {
    requestUrl = new URL(url)
    return jsonResponse({
      query: {
        search: Array.from({ length: 25 }, (_, index) => ({
          title: `Q${index + 1}`,
        })),
      },
    })
  }

  const results = await searchWikidataCandidates('  Jaipur city  ', {
    language: 'hi',
    fetchImpl,
  })

  assert.equal(requestUrl.origin, 'https://www.wikidata.org')
  assert.equal(requestUrl.pathname, '/w/api.php')
  assert.equal(requestUrl.searchParams.get('action'), 'query')
  assert.equal(requestUrl.searchParams.get('list'), 'search')
  assert.equal(requestUrl.searchParams.get('srsearch'), 'Jaipur city')
  assert.equal(requestUrl.searchParams.get('srnamespace'), '0')
  assert.equal(requestUrl.searchParams.get('srlimit'), '20')
  assert.equal(requestUrl.searchParams.get('uselang'), 'hi')
  assert.equal(requestUrl.searchParams.get('origin'), '*')
  assert.equal(results.length, 20)
  assert.deepEqual(
    results.map((result) => result.id),
    [
      'Q1',
      'Q2',
      'Q3',
      'Q4',
      'Q5',
      'Q6',
      'Q7',
      'Q8',
      'Q9',
      'Q10',
      'Q11',
      'Q12',
      'Q13',
      'Q14',
      'Q15',
      'Q16',
      'Q17',
      'Q18',
      'Q19',
      'Q20',
    ],
  )
})

test('maps supported results before unsupported results without losing candidate order', async () => {
  const requests = []
  const fetchImpl = async (url, options = {}) => {
    const requestUrl = new URL(url)
    requests.push({ url: requestUrl, options })

    if (requestUrl.hostname === 'en.wikipedia.org') {
      return jsonResponse({
        query: { pages: [{ title: 'Jaipur draft', missing: true }] },
      })
    }

    if (requestUrl.searchParams.get('list') === 'search') {
      return jsonResponse({
        query: {
          search: [{ title: 'Q10' }, { title: 'Q20' }, { title: 'Q30' }],
        },
      })
    }

    if (requestUrl.searchParams.get('action') === 'wbgetentities') {
      return jsonResponse({
        entities: {
          Q10: {
            labels: { en: { language: 'en', value: 'First candidate' } },
            descriptions: { en: { language: 'en', value: 'No matching outline' } },
            claims: {
              P31: [entityClaim('Q900')],
              P18: [stringClaim('First image.jpg')],
            },
            sitelinks: {},
          },
          Q20: {
            labels: { en: { language: 'fr', value: 'Second candidate' } },
            descriptions: { en: { language: 'en', value: 'Direct occupation match' } },
            claims: {
              P31: [entityClaim('Q5')],
              P106: [entityClaim('Q200')],
              P18: [stringClaim('Writer portrait.jpg')],
            },
            sitelinks: {
              enwiki: {
                site: 'enwiki',
                title: 'Second candidate',
                url: 'https://en.wikipedia.org/wiki/Second_candidate',
              },
              frwiki: {
                site: 'frwiki',
                title: 'Deuxième candidat',
                url: 'https://fr.wikipedia.org/wiki/Deuxi%C3%A8me_candidat',
              },
            },
          },
          Q30: {
            labels: { en: { language: 'en', value: 'Third candidate' } },
            descriptions: { en: { language: 'en', value: 'Hierarchy match' } },
            claims: { P31: [entityClaim('Q901')] },
            sitelinks: {},
          },
        },
      })
    }

    if (requestUrl.hostname === 'query.wikidata.org') {
      const query = requestUrl.searchParams.get('query')
      const bindings = query.includes('wdt:P31/wdt:P279+') ? [hierarchyBinding('Q30', 'Q100')] : []
      return jsonResponse({ results: { bindings } })
    }

    assert.fail(`Unexpected request: ${requestUrl}`)
  }

  const outlines = [
    {
      articleType: 'Q100',
      label: 'Place',
      matchVia: null,
      hierarchyDepth: 10,
      thumbnail: 'https://example.test/place.jpg',
    },
    {
      articleType: 'Q200',
      label: 'Writer',
      matchVia: 'P106',
      hierarchyDepth: 20,
      thumbnail: 'https://example.test/writer.jpg',
    },
  ]

  const outcome = await searchSubjects('Jaipur draft', outlines, { fetchImpl })

  assert.equal(outcome.articleExists, false)
  assert.deepEqual(
    outcome.results.map((result) => result.id),
    ['Q20', 'Q30', 'Q10'],
  )
  assert.deepEqual(outcome.results[0], {
    id: 'Q20',
    label: 'Second candidate',
    labelFallback: true,
    description: 'Direct occupation match',
    url: 'https://www.wikidata.org/wiki/Q20',
    matchedQId: 'Q200',
    thumbnail:
      'https://commons.wikimedia.org/wiki/Special:Redirect/file/Writer%20portrait.jpg?width=60',
    outlineName: 'Writer',
    supported: true,
    sitelinkCount: 2,
    localSitelink: {
      site: 'enwiki',
      title: 'Second candidate',
      url: 'https://en.wikipedia.org/wiki/Second_candidate',
    },
  })
  assert.equal(outcome.results[1].matchedQId, 'Q100')
  assert.equal(outcome.results[1].thumbnail, 'https://example.test/place.jpg')
  assert.equal(outcome.results[1].outlineName, 'Place')
  assert.equal(outcome.results[1].supported, true)
  assert.equal(outcome.results[2].matchedQId, null)
  assert.equal(outcome.results[2].outlineName, null)
  assert.equal(outcome.results[2].supported, false)

  const entityRequests = requests.filter(
    ({ url }) => url.searchParams.get('action') === 'wbgetentities',
  )
  assert.equal(entityRequests.length, 1)
  assert.equal(entityRequests[0].url.searchParams.get('ids'), 'Q10|Q20|Q30')
  assert.equal(
    entityRequests[0].url.searchParams.get('props'),
    'claims|sitelinks/urls|labels|descriptions',
  )
})

test('excludes configured item types through direct and hierarchy P31 matches', async () => {
  const sparqlQueries = []
  const fetchImpl = async (url) => {
    const requestUrl = new URL(url)
    if (requestUrl.hostname === 'en.wikipedia.org') {
      return jsonResponse({ query: { pages: [{ title: 'Example', missing: true }] } })
    }
    if (requestUrl.searchParams.get('list') === 'search') {
      return jsonResponse({
        query: {
          search: [{ title: 'Q41' }, { title: 'Q42' }, { title: 'Q43' }],
        },
      })
    }
    if (requestUrl.searchParams.get('action') === 'wbgetentities') {
      return jsonResponse({
        entities: {
          Q41: entityFixture('Directly excluded', {
            P31: [entityClaim('Q4167410')],
          }),
          Q42: entityFixture('Hierarchy excluded', {
            P31: [entityClaim('Q900')],
          }),
          Q43: entityFixture('Supported item', {
            P31: [entityClaim('Q100')],
          }),
        },
      })
    }
    if (requestUrl.hostname === 'query.wikidata.org') {
      const query = requestUrl.searchParams.get('query')
      sparqlQueries.push(query)
      return jsonResponse({
        results: {
          bindings: query.includes('wd:Q4167410') ? [hierarchyBinding('Q42', 'Q13406463')] : [],
        },
      })
    }
    assert.fail(`Unexpected request: ${requestUrl}`)
  }

  const { results } = await searchSubjects(
    'Example',
    [
      {
        articleType: 'Q100',
        label: 'Supported type',
        matchVia: null,
        hierarchyDepth: 1,
        thumbnail: null,
      },
    ],
    { fetchImpl },
  )

  assert.deepEqual(
    results.map((result) => result.id),
    ['Q43'],
  )
  const exclusionQuery = sparqlQueries.find((query) => query.includes('wd:Q4167410'))
  assert.ok(exclusionQuery)
  assert.match(exclusionQuery, /wdt:P31\/wdt:P279\*/)
  for (const excludedQId of ['Q4167410', 'Q13406463', 'Q11266439', 'Q4167836']) {
    assert.match(exclusionQuery, new RegExp(`wd:${excludedQId}\\b`))
  }
})

test('checks page existence against MediaWiki-normalized titles', async () => {
  const seenUrls = []
  const responses = [
    {
      query: {
        normalized: [{ from: 'jaipur_city', to: 'Jaipur city' }],
        pages: [{ pageid: 123, title: 'Jaipur city' }],
      },
    },
    {
      query: {
        normalized: [{ from: 'missing_page', to: 'Missing page' }],
        pages: [{ title: 'Missing page', missing: true }],
      },
    },
  ]
  const fetchImpl = async (url) => {
    seenUrls.push(new URL(url))
    return jsonResponse(responses.shift())
  }

  assert.equal(await checkPageExists('  jaipur_city  ', { fetchImpl }), true)
  assert.equal(await checkPageExists('missing_page', { fetchImpl }), false)

  assert.equal(seenUrls[0].hostname, 'en.wikipedia.org')
  assert.equal(seenUrls[0].searchParams.get('action'), 'query')
  assert.equal(seenUrls[0].searchParams.get('titles'), 'jaipur_city')
  assert.equal(seenUrls[0].searchParams.get('formatversion'), '2')
  assert.equal(seenUrls[0].searchParams.get('origin'), '*')
})

test('retries only 429 and 5xx responses and makes at most two attempts', async () => {
  let transientAttempts = 0
  const transientFetch = async () => {
    transientAttempts += 1
    if (transientAttempts === 1) {
      return jsonResponse(
        { error: 'temporarily unavailable' },
        { status: 503, headers: { 'Retry-After': '0' } },
      )
    }
    return jsonResponse({ query: { search: [{ title: 'Q1' }] } })
  }
  const recovered = await searchWikidataCandidates('Example', {
    fetchImpl: transientFetch,
  })
  assert.equal(transientAttempts, 2)
  assert.deepEqual(
    recovered.map((result) => result.id),
    ['Q1'],
  )

  let clientErrorAttempts = 0
  await assert.rejects(
    searchWikidataCandidates('Example', {
      fetchImpl: async () => {
        clientErrorAttempts += 1
        return jsonResponse({ error: 'bad request' }, { status: 400 })
      },
    }),
    /400/,
  )
  assert.equal(clientErrorAttempts, 1)

  let persistentAttempts = 0
  await assert.rejects(
    searchWikidataCandidates('Example', {
      fetchImpl: async () => {
        persistentAttempts += 1
        return jsonResponse({ error: 'still unavailable' }, { status: 429 })
      },
    }),
    /429/,
  )
  assert.equal(persistentAttempts, 2)
})

test('propagates caller cancellation to every parallel downstream fetch', async () => {
  const controller = new AbortController()
  const downstreamSignals = []
  let markStarted
  const started = new Promise((resolve) => {
    markStarted = resolve
  })
  const fetchImpl = async (_url, { signal }) => {
    downstreamSignals.push(signal)
    if (downstreamSignals.length === 2) {
      markStarted()
    }
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  }

  const request = searchSubjects('Cancelled query', [], {
    fetchImpl,
    signal: controller.signal,
  })
  await started
  controller.abort()

  await assert.rejects(request, (error) => error.name === 'AbortError')
  assert.equal(downstreamSignals.length, 2)
  assert.ok(downstreamSignals.every((signal) => signal.aborted))
})

test('retries attempt timeouts once and identifies Wikimedia API requests', async () => {
  assert.equal(ACTION_API_TIMEOUT_MS, 8_000)
  assert.equal(WDQS_TIMEOUT_MS, 15_000)
  assert.match(wikimediaRequestHeaders()['Api-User-Agent'], /ArticleGuidance subject search$/)

  const attemptSignals = []
  await assert.rejects(
    fetchJsonWithRetry('https://www.wikidata.org/w/api.php', {
      timeoutMs: 5,
      requestName: 'Timed request',
      fetchImpl: async (_url, { signal, headers }) => {
        assert.match(headers['Api-User-Agent'], /ArticleGuidance subject search$/)
        attemptSignals.push(signal)
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          })
        })
      },
    }),
    (error) => error.name === 'TimeoutError' && /timed out after 5ms/.test(error.message),
  )
  assert.equal(attemptSignals.length, 2)
  assert.ok(attemptSignals.every((signal) => signal.aborted))
})

test('keeps caller cancellation active while the response body is decoding', async () => {
  const controller = new AbortController()
  let bodyStarted
  const started = new Promise((resolve) => {
    bodyStarted = resolve
  })
  let attempts = 0

  const request = fetchJsonWithRetry('https://www.wikidata.org/w/api.php', {
    signal: controller.signal,
    fetchImpl: async (_url, { signal }) => {
      attempts += 1
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => {
          bodyStarted()
          return new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            })
          })
        },
      }
    },
  })

  await started
  controller.abort()
  const outcome = await Promise.race([
    request.then(
      () => 'resolved',
      (error) => error.name,
    ),
    new Promise((resolve) => setTimeout(() => resolve('stalled'), 25)),
  ])

  assert.equal(outcome, 'AbortError')
  assert.equal(attempts, 1)
})

test('reuses successful subject searches within the page session', async () => {
  clearSearchCache()
  let calls = 0
  const fetchImpl = async (url) => {
    calls += 1
    const requestUrl = new URL(url)
    if (requestUrl.hostname === 'en.wikipedia.org') {
      return jsonResponse({ query: { pages: [{ title: 'Cached query', missing: true }] } })
    }
    return jsonResponse({ query: { search: [] } })
  }

  const options = { fetchImpl, cache: true }
  const first = await searchSubjects('Cached query', [], options)
  const second = await searchSubjects('Cached query', [], options)

  assert.deepEqual(second, first)
  assert.equal(calls, 2)
})

function entityClaim(id) {
  return {
    mainsnak: {
      snaktype: 'value',
      datavalue: { type: 'wikibase-entityid', value: { id } },
    },
  }
}

function stringClaim(value) {
  return {
    mainsnak: {
      snaktype: 'value',
      datavalue: { type: 'string', value },
    },
  }
}

function hierarchyBinding(itemQId, outlineQId) {
  return {
    item: { value: `http://www.wikidata.org/entity/${itemQId}` },
    outlineType: { value: `http://www.wikidata.org/entity/${outlineQId}` },
  }
}

function entityFixture(label, claims = {}) {
  return {
    labels: { en: { language: 'en', value: label } },
    descriptions: {},
    claims,
    sitelinks: {},
  }
}

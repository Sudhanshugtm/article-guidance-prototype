import {
  EXCLUDED_KEY,
  applyHierarchyMatches,
  collectDirectMatches,
  groupOutlinesByMatchVia,
  propForGroup,
  selectBestMatches,
} from './outlineMatching.js'

const WIKIDATA_API_URL = 'https://www.wikidata.org/w/api.php'
const WDQS_URL = 'https://query.wikidata.org/sparql'
const MAX_CANDIDATES = 20
const OUTLINE_SENTINEL_QID = 'Q1'
export const ACTION_API_TIMEOUT_MS = 8_000
export const WDQS_TIMEOUT_MS = 15_000
const API_USER_AGENT =
  'ArticleGuidancePrototype/1.0 (https://github.com/Sudhanshugtm/article-guidance-prototype)'
const REQUEST_PURPOSE = 'ArticleGuidance subject search'
const EXCLUDED_ITEM_TYPES = ['Q4167410', 'Q13406463', 'Q11266439', 'Q4167836']
const searchResultCache = new Map()

export function clearSearchCache() {
  searchResultCache.clear()
}

export async function searchWikidataCandidates(query, options = {}) {
  const { language = 'en' } = options
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    return []
  }

  const url = new URL(WIKIDATA_API_URL)
  url.search = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: normalizedQuery,
    srnamespace: '0',
    srlimit: String(MAX_CANDIDATES),
    uselang: language,
    format: 'json',
    origin: '*',
  })

  const data = await fetchJsonWithRetry(url, {
    ...options,
    timeoutMs: ACTION_API_TIMEOUT_MS,
    requestName: 'Wikidata search',
  })
  return (data.query?.search || [])
    .filter((item) => /^Q\d+$/.test(item.title))
    .slice(0, MAX_CANDIDATES)
    .map((item) => ({
      id: item.title,
      label: item.title,
      description: '',
      url: `https://www.wikidata.org/wiki/${item.title}`,
    }))
}

export async function checkPageExists(title, options = {}) {
  const { language = 'en' } = options
  const normalizedTitle = title.trim()
  if (!normalizedTitle) {
    return false
  }

  const url = new URL(`https://${language}.wikipedia.org/w/api.php`)
  url.search = new URLSearchParams({
    action: 'query',
    titles: normalizedTitle,
    format: 'json',
    formatversion: '2',
    origin: '*',
  })
  const data = await fetchJsonWithRetry(url, {
    ...options,
    timeoutMs: ACTION_API_TIMEOUT_MS,
    requestName: 'Page existence check',
  })
  const normalized = new Map((data.query?.normalized || []).map(({ from, to }) => [from, to]))
  const canonicalTitle = normalized.get(normalizedTitle) || normalizedTitle
  const page = (data.query?.pages || []).find((candidate) => candidate.title === canonicalTitle)
  return Boolean(page && page.missing !== true && page.missing !== '')
}

export async function searchSubjects(query, outlines, options = {}) {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    return { results: [], articleExists: false }
  }

  const language = options.language || 'en'
  const useCache =
    options.cache === true ||
    (options.cache !== false && !Object.prototype.hasOwnProperty.call(options, 'fetchImpl'))
  const cacheKey = `${language}\u0000${normalizedQuery.toLocaleLowerCase(language)}`
  if (useCache && searchResultCache.has(cacheKey)) {
    throwIfAborted(options.signal)
    return searchResultCache.get(cacheKey)
  }

  const [candidates, articleExists] = await Promise.all([
    searchWikidataCandidates(normalizedQuery, options),
    checkPageExists(normalizedQuery, options),
  ])
  if (candidates.length === 0) {
    const outcome = { results: [], articleExists }
    if (useCache) searchResultCache.set(cacheKey, outcome)
    return outcome
  }

  const validOutlines = outlines.filter((outline) => outline.articleType)
  const groups = groupOutlinesByMatchVia(validOutlines)
  const properties = [...new Set([...Object.keys(groups).map(propForGroup), 'P31', 'P18'])]
  const qids = candidates.map((candidate) => candidate.id)
  const [entities, hierarchyMatches] = await Promise.all([
    fetchEntityData(qids, properties, options),
    fetchHierarchyMatches(qids, groups, options),
  ])

  const excludedTypes = new Set(EXCLUDED_ITEM_TYPES)
  const hierarchyExclusions = hierarchyMatches[EXCLUDED_KEY] || {}
  const filteredCandidates = candidates.filter((candidate) => {
    const directTypes = entities[candidate.id]?.claims.P31 || []
    const directlyExcluded = directTypes.some((qid) => excludedTypes.has(qid))
    const hierarchyExcluded = hierarchyExclusions[candidate.id]?.size > 0
    return !directlyExcluded && !hierarchyExcluded
  })
  const filteredQids = filteredCandidates.map((candidate) => candidate.id)

  const outlineQIds = new Set(validOutlines.map((outline) => outline.articleType))
  const matches = {}
  filteredQids.forEach((qid) => {
    if (outlineQIds.has(qid)) {
      matches[qid] = [qid]
    }
  })

  const directTypesByGroup = {}
  Object.keys(groups).forEach((key) => {
    const property = propForGroup(key)
    directTypesByGroup[key] = {}
    filteredQids.forEach((qid) => {
      const values = entities[qid]?.claims[property] || []
      if (values.length > 0) {
        directTypesByGroup[key][qid] = new Set(values)
      }
    })
  })
  collectDirectMatches(matches, filteredQids, directTypesByGroup, outlineQIds)
  applyHierarchyMatches(matches, hierarchyMatches)
  const bestMatches = selectBestMatches(matches, validOutlines)

  const outlineByType = Object.fromEntries(
    validOutlines.map((outline) => [outline.articleType, outline]),
  )
  const supported = []
  const unsupported = []
  filteredCandidates.forEach((candidate) => {
    const matchedQIds = bestMatches[candidate.id] || []
    const target = matchedQIds.length > 0 ? supported : unsupported
    target.push(mapSearchResult(candidate, entities[candidate.id], matchedQIds, outlineByType))
  })

  const outcome = { results: supported.concat(unsupported), articleExists }
  if (useCache) searchResultCache.set(cacheKey, outcome)
  return outcome
}

async function fetchEntityData(qids, properties, options) {
  const { language = 'en' } = options
  const url = new URL(WIKIDATA_API_URL)
  url.search = new URLSearchParams({
    action: 'wbgetentities',
    ids: qids.join('|'),
    props: 'claims|sitelinks/urls|labels|descriptions',
    languages: language,
    languagefallback: '1',
    format: 'json',
    origin: '*',
  })
  const data = await fetchJsonWithRetry(url, {
    ...options,
    timeoutMs: ACTION_API_TIMEOUT_MS,
    requestName: 'Wikidata entity request',
  })

  return Object.fromEntries(
    Object.entries(data.entities || {}).flatMap(([qid, entity]) => {
      if (entity.missing !== undefined) {
        return []
      }
      const claims = Object.fromEntries(
        properties.map((property) => [property, readEntityClaimIds(entity.claims?.[property])]),
      )
      const imageFilename = readStringClaim(entity.claims?.P18)
      const labelEntry = entity.labels?.[language] || Object.values(entity.labels || {})[0]
      const descriptionEntry =
        entity.descriptions?.[language] || Object.values(entity.descriptions || {})[0]
      const wikipediaSitelinks = Object.values(entity.sitelinks || {}).filter((sitelink) =>
        sitelink.url?.includes('wikipedia.org'),
      )
      const localSitelinkKey = language === 'en' ? 'enwiki' : `${language}wiki`

      return [
        [
          qid,
          {
            claims,
            label: labelEntry?.value || qid,
            labelFallback: Boolean(
              labelEntry && labelEntry.language !== language && labelEntry.language !== 'mul',
            ),
            description: descriptionEntry?.value || '',
            imageFilename,
            sitelinkCount: wikipediaSitelinks.length,
            localSitelink: entity.sitelinks?.[localSitelinkKey] || null,
          },
        ],
      ]
    }),
  )
}

async function fetchHierarchyMatches(qids, groups, options) {
  const groupsWithExclusions = {
    ...groups,
    [EXCLUDED_KEY]: EXCLUDED_ITEM_TYPES,
  }
  const tasks = Object.entries(groupsWithExclusions)
    .filter(([, outlineQIds]) => outlineQIds.length > 0)
    .map(async ([key, outlineQIds]) => {
      const path = hierarchyPathForGroup(key)
      const paddedOutlines =
        outlineQIds.length === 1 ? outlineQIds.concat(OUTLINE_SENTINEL_QID) : outlineQIds
      const query = [
        'SELECT ?item ?outlineType WHERE {',
        `  VALUES ?item { ${qids.map((qid) => `wd:${qid}`).join(' ')} }`,
        `  VALUES ?outlineType { ${paddedOutlines.map((qid) => `wd:${qid}`).join(' ')} }`,
        `  ?item ${path} ?outlineType .`,
        '}',
      ].join('\n')
      const bindings = await executeSparql(query, options)
      const itemOutlineMap = {}
      bindings.forEach((binding) => {
        const itemQId = extractQId(binding.item?.value)
        const outlineQId = extractQId(binding.outlineType?.value)
        if (!itemQId || !outlineQId || outlineQId === OUTLINE_SENTINEL_QID) {
          return
        }
        if (!itemOutlineMap[itemQId]) {
          itemOutlineMap[itemQId] = new Set()
        }
        itemOutlineMap[itemQId].add(outlineQId)
      })
      return [key, itemOutlineMap]
    })

  return Object.fromEntries(await Promise.all(tasks))
}

async function executeSparql(query, options) {
  const url = new URL(WDQS_URL)
  url.search = new URLSearchParams({ query, format: 'json' })
  const data = await fetchJsonWithRetry(url, {
    ...options,
    timeoutMs: WDQS_TIMEOUT_MS,
    requestName: 'SPARQL query',
    headers: { Accept: 'application/sparql-results+json' },
  })
  return data.results?.bindings || []
}

export function wikimediaRequestHeaders(purpose = REQUEST_PURPOSE) {
  const normalizedPurpose = purpose.trim()
  return {
    'Api-User-Agent': normalizedPurpose ? `${API_USER_AGENT} ${normalizedPurpose}` : API_USER_AGENT,
  }
}

export async function fetchJsonWithRetry(url, options = {}) {
  const {
    fetchImpl = fetch,
    signal,
    timeoutMs = ACTION_API_TIMEOUT_MS,
    requestName = 'Wikimedia API request',
    headers = {},
  } = options
  const requestHeaders = {
    ...wikimediaRequestHeaders(),
    ...headers,
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    throwIfAborted(signal)
    const attemptContext = createAttemptContext(signal, timeoutMs)
    let response

    try {
      response = await fetchImpl(url, {
        signal: attemptContext.signal,
        headers: requestHeaders,
      })
      if (response.ok) {
        const data = await response.json()
        attemptContext.cleanup()
        return data
      }
    } catch (error) {
      attemptContext.cleanup()
      if (signal?.aborted) {
        throw abortReason(signal)
      }
      if (!attemptContext.didTimeout()) {
        throw error
      }
      if (attempt === 0) {
        continue
      }
      throw timeoutError(requestName, timeoutMs, error)
    }

    attemptContext.cleanup()
    if (attemptContext.didTimeout()) {
      if (attempt === 0) {
        continue
      }
      throw timeoutError(requestName, timeoutMs)
    }
    const retryable = response.status === 429 || response.status >= 500
    if (!retryable || attempt === 1) {
      throw httpError(requestName, response.status)
    }
    await waitForRetry(response.headers.get('Retry-After'), signal)
  }

  throw new Error(`${requestName} failed`)
}

function createAttemptContext(callerSignal, timeoutMs) {
  const controller = new AbortController()
  let timedOut = false
  const forwardCallerAbort = () => controller.abort(abortReason(callerSignal))
  if (callerSignal) {
    callerSignal.addEventListener('abort', forwardCallerAbort, { once: true })
  }
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort(timeoutError('Wikimedia API request', timeoutMs))
  }, timeoutMs)

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timeoutId)
      callerSignal?.removeEventListener('abort', forwardCallerAbort)
    },
  }
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw abortReason(signal)
  }
}

function abortReason(signal) {
  return signal?.reason || new DOMException('The request was aborted', 'AbortError')
}

function timeoutError(requestName, timeoutMs, cause) {
  const error = new Error(`${requestName} timed out after ${timeoutMs}ms`, {
    cause,
  })
  error.name = 'TimeoutError'
  return error
}

function httpError(requestName, status) {
  const error = new Error(`${requestName} failed: ${status}`)
  error.name = 'HttpError'
  error.status = status
  return error
}

async function waitForRetry(retryAfter, signal) {
  const delay = retryAfterMilliseconds(retryAfter)
  if (delay <= 0) {
    throwIfAborted(signal)
    return
  }
  await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort)
      resolve()
    }, delay)
    const handleAbort = () => {
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', handleAbort)
      reject(abortReason(signal))
    }
    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}

function retryAfterMilliseconds(value) {
  if (!value) {
    return 250
  }
  const seconds = Number(value)
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1_000)
  }
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : Math.max(0, timestamp - Date.now())
}

function hierarchyPathForGroup(key) {
  if (key === EXCLUDED_KEY) {
    return 'wdt:P31/wdt:P279*'
  }
  if (key === 'P171') {
    return 'wdt:P171+'
  }
  return `wdt:${propForGroup(key)}/wdt:P279+`
}

function readEntityClaimIds(statements = []) {
  return statements
    .filter(
      (statement) =>
        statement.mainsnak?.snaktype === 'value' &&
        statement.mainsnak?.datavalue?.type === 'wikibase-entityid',
    )
    .map((statement) => statement.mainsnak.datavalue.value.id)
}

function readStringClaim(statements = []) {
  return statements.find(
    (statement) =>
      statement.mainsnak?.snaktype === 'value' && statement.mainsnak?.datavalue?.type === 'string',
  )?.mainsnak.datavalue.value
}

function extractQId(uri = '') {
  return uri.match(/Q\d+$/)?.[0] || null
}

function commonsThumbnail(filename) {
  return filename
    ? `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(
        filename,
      )}?width=60`
    : null
}

function mapSearchResult(candidate, entity, matchedQIds, outlineByType) {
  const matchedOutlines = matchedQIds.map((qid) => outlineByType[qid]).filter(Boolean)
  const outlineNames = [...new Set(matchedOutlines.map((outline) => outline.label).filter(Boolean))]
  const outlineThumbnail = matchedOutlines.find((outline) => outline.thumbnail)?.thumbnail

  return {
    id: candidate.id,
    label: entity?.label || candidate.id,
    labelFallback: entity?.labelFallback || false,
    description: entity?.description || '',
    url: candidate.url,
    matchedQId: matchedQIds[0] || null,
    thumbnail: commonsThumbnail(entity?.imageFilename) || outlineThumbnail || null,
    outlineName: outlineNames.length > 0 ? outlineNames.join(', ') : null,
    supported: matchedQIds.length > 0,
    sitelinkCount: entity?.sitelinkCount || 0,
    localSitelink: entity?.localSitelink || null,
  }
}

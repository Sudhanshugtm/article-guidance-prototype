const STAGE_MESSAGES = Object.freeze({
  checking: 'Checking for a matching subject',
  'longer-wait': 'Still checking. This may take a moment.',
})

const MAX_TOTAL_RESULTS = 8
const MAX_UNSUPPORTED_RESULTS = 3

export function resolveSearchPresentation({
  hasQuery,
  loading = false,
  stage = 'checking',
  error = false,
  resultCount = 0,
  articleExists,
}) {
  if (!hasQuery) {
    return {
      kind: 'idle',
      showBrowseFallback: false,
    }
  }

  if (loading) {
    return {
      kind: 'loading',
      message: STAGE_MESSAGES[stage] || STAGE_MESSAGES.checking,
      showBrowseFallback: false,
    }
  }

  if (error) {
    return {
      kind: 'error',
      showBrowseFallback: true,
    }
  }

  if (resultCount > 0) {
    return {
      kind: 'results',
      showBrowseFallback: true,
    }
  }

  if (articleExists === false) {
    return {
      kind: 'no-results',
      showBrowseFallback: true,
    }
  }

  return {
    kind: 'idle',
    showBrowseFallback: false,
  }
}

export function selectVisibleResults(results) {
  const supported = results.filter((result) => result.supported)
  const unsupported = results
    .filter((result) => !result.supported)
    .slice(0, MAX_UNSUPPORTED_RESULTS)

  return supported.concat(unsupported).slice(0, MAX_TOTAL_RESULTS)
}

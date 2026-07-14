export const PROP_INSTANCE_OF = 'P31'
export const EXCLUDED_KEY = '__excluded__'

export function propForGroup(key) {
  return key === 'default' ? PROP_INSTANCE_OF : key
}

export function groupOutlinesByMatchVia(outlines) {
  return outlines.reduce((groups, outline) => {
    const key = outline.matchVia || 'default'
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(outline.articleType)
    return groups
  }, {})
}

export function collectDirectMatches(matches, itemQIds, directTypesByGroup, outlineQIdSet) {
  Object.values(directTypesByGroup).forEach((itemTypeMap) => {
    itemQIds.forEach((qid) => {
      const directTypes = itemTypeMap[qid]
      if (!directTypes) {
        return
      }
      directTypes.forEach((directType) => {
        if (!outlineQIdSet.has(directType)) {
          return
        }
        if (!matches[qid]) {
          matches[qid] = []
        }
        if (!matches[qid].includes(directType)) {
          matches[qid].push(directType)
        }
      })
    })
  })
}

export function applyHierarchyMatches(matches, itemHierarchyMatches) {
  Object.entries(itemHierarchyMatches).forEach(([key, itemOutlineMap]) => {
    if (key === EXCLUDED_KEY) {
      return
    }
    Object.entries(itemOutlineMap).forEach(([itemQId, outlineSet]) => {
      if (!matches[itemQId]) {
        matches[itemQId] = []
      }
      outlineSet.forEach((outlineQId) => {
        if (!matches[itemQId].includes(outlineQId)) {
          matches[itemQId].push(outlineQId)
        }
      })
    })
  })
}

export function selectBestMatches(matches, outlines) {
  const depthByType = {}
  const matchViaByType = {}
  outlines.forEach((outline) => {
    if (outline.articleType) {
      depthByType[outline.articleType] = outline.hierarchyDepth || 0
      matchViaByType[outline.articleType] = outline.matchVia || null
    }
  })

  const result = {}
  Object.entries(matches).forEach(([itemQId, outlineQIds]) => {
    const hasNonDefault = outlineQIds.some((qid) => matchViaByType[qid] !== null)
    const strategyFiltered = hasNonDefault
      ? outlineQIds.filter((qid) => matchViaByType[qid] !== null)
      : outlineQIds

    const maxDepth = strategyFiltered.reduce((max, qid) => Math.max(max, depthByType[qid] || 0), 0)
    result[itemQId] =
      maxDepth > 0
        ? strategyFiltered.filter((qid) => (depthByType[qid] || 0) === maxDepth)
        : strategyFiltered
  })
  return result
}

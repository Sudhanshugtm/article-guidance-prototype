<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  CdxButton,
  CdxCard,
  CdxIcon,
  CdxMessage,
  CdxProgressIndicator,
  CdxTextInput,
} from '@wikimedia/codex'
import { cdxIconArrowPrevious, cdxIconArticle } from '@wikimedia/codex-icons'

import ChromeWrapper from '@/components/chrome/ChromeWrapper.vue'
import { globalSkin } from '@/theme'
import outlinesSnapshot from './outlines.json'
import { resolveSearchPresentation, selectVisibleResults } from './searchPresentation.js'
import { searchSubjects } from './searchClient.js'

definePage({
  meta: {
    hidden: true,
  },
})

interface SubjectResult {
  id: string
  label: string
  labelFallback?: boolean
  description: string
  url: string
  matchedQId: string | null
  thumbnail: string | null
  outlineName: string | null
  supported: boolean
}

interface Outline {
  title: string
  label: string
  description: string
  articleType: string
  matchVia: string | null
  thumbnail: string | null
  hierarchyDepth: number
}

type RequestStage = 'checking' | 'longer-wait'

const route = useRoute()
const router = useRouter()
const outlineHeading = ref<HTMLElement | null>(null)
const browseTrigger = ref<InstanceType<typeof CdxButton> | null>(null)

function firstQueryValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? '')
  return typeof value === 'string' ? value : ''
}

const initialTitle =
  firstQueryValue(route.query.newarticletitle).trim() ||
  firstQueryValue(route.query.q).trim() ||
  'Jaipur'

const searchQuery = ref(initialTitle)
const results = ref<SubjectResult[]>([])
const articleExists = ref<boolean | null>(null)
const loading = ref(false)
const error = ref<Error | null>(null)
const requestStage = ref<RequestStage>('checking')
const showOutlines = ref(false)
const selectedType = ref<string | null>(null)

const outlines = (outlinesSnapshot as Outline[]).filter((outline) => outline.articleType)
const sortedOutlines = [...outlines].sort((a, b) => a.label.localeCompare(b.label))

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let escalationTimer: ReturnType<typeof setTimeout> | null = null
let activeController: AbortController | null = null
let latestRequestId = 0

const hasQuery = computed(() => searchQuery.value.trim().length > 0)
const presentation = computed(() =>
  resolveSearchPresentation({
    hasQuery: hasQuery.value,
    loading: loading.value,
    stage: requestStage.value,
    error: Boolean(error.value),
    resultCount: results.value.length,
    articleExists: articleExists.value,
  }),
)
const visibleResults = computed<SubjectResult[]>(() => selectVisibleResults(results.value))
const hasFallbackLabels = computed(() =>
  visibleResults.value.some((result) => result.labelFallback),
)

function clearDebounce(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

function clearEscalation(): void {
  if (escalationTimer !== null) {
    clearTimeout(escalationTimer)
    escalationTimer = null
  }
}

function cancelActiveSearch(): void {
  activeController?.abort()
  activeController = null
  clearEscalation()
}

function updateShareUrl(title: string): void {
  const query = { ...route.query }
  delete query.q
  query.newarticletitle = title || undefined
  query.v = 'messages-post'
  void router.replace({ query })
}

async function performSearch(rawTitle = searchQuery.value): Promise<void> {
  const title = rawTitle.trim()
  clearDebounce()
  cancelActiveSearch()

  if (!title) {
    latestRequestId += 1
    loading.value = false
    results.value = []
    articleExists.value = null
    error.value = null
    return
  }

  const requestId = ++latestRequestId
  const controller = new AbortController()
  activeController = controller
  loading.value = true
  error.value = null
  results.value = []
  articleExists.value = null
  requestStage.value = 'checking'
  escalationTimer = setTimeout(() => {
    if (requestId === latestRequestId && loading.value) {
      requestStage.value = 'longer-wait'
    }
  }, 2000)

  try {
    const response = await searchSubjects(title, outlines, {
      signal: controller.signal,
      language: 'en',
    })
    if (requestId !== latestRequestId) return
    results.value = response.results
    articleExists.value = response.articleExists
  } catch (caught) {
    if (controller.signal.aborted || requestId !== latestRequestId) return
    error.value = caught instanceof Error ? caught : new Error(String(caught))
  } finally {
    if (requestId === latestRequestId) {
      clearEscalation()
      loading.value = false
      activeController = null
    }
  }
}

function scheduleSearch(title: string): void {
  clearDebounce()
  cancelActiveSearch()
  latestRequestId += 1
  results.value = []
  articleExists.value = null
  error.value = null
  loading.value = false
  requestStage.value = 'checking'

  if (!title.trim()) return
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void performSearch(title)
  }, 300)
}

function browseOutlines(): void {
  showOutlines.value = true
  selectedType.value = null
  void nextTick(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
    outlineHeading.value?.focus()
  })
}

function hideOutlines(): void {
  showOutlines.value = false
  selectedType.value = null
  void nextTick(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
    browseTrigger.value?.button?.focus()
  })
}

function selectOutline(outline: Outline): void {
  selectedType.value = outline.articleType
}

function cardThumbnail(thumbnail: string | null): { url: string } | undefined {
  return thumbnail ? { url: thumbnail } : undefined
}

watch(searchQuery, (title) => {
  if (showOutlines.value) showOutlines.value = false
  selectedType.value = null
  updateShareUrl(title)
  scheduleSearch(title)
})

onMounted(() => {
  updateShareUrl(searchQuery.value)
  void performSearch(searchQuery.value)
})

onBeforeUnmount(() => {
  clearDebounce()
  cancelActiveSearch()
  latestRequestId += 1
})
</script>

<template>
  <ChromeWrapper :last-edited-notice="false">
    <div class="ag-prototype" :data-skin="globalSkin">
      <header class="ag-step-header">
        <div class="ag-step-header__inner">
          <div class="ag-step-header__back">
            <CdxButton v-if="showOutlines" weight="quiet" aria-label="Back" @click="hideOutlines">
              <CdxIcon :icon="cdxIconArrowPrevious" />
            </CdxButton>
          </div>
          <h1 class="ag-step-header__title">New article</h1>
          <div class="ag-step-header__spacer" />
        </div>
      </header>

      <div class="ag-step-body">
        <div class="ag-step-content">
          <div class="ag-search-controls">
            <CdxTextInput
              v-model="searchQuery"
              class="ag-search-input"
              placeholder="Article title"
              aria-label="Article title"
            />
          </div>

          <section v-if="showOutlines" class="ag-outlines" aria-labelledby="outline-heading">
            <CdxButton
              class="ag-outlines__desktop-back"
              action="progressive"
              weight="quiet"
              @click="hideOutlines"
            >
              <CdxIcon :icon="cdxIconArrowPrevious" />
              Back
            </CdxButton>
            <h2
              ref="outlineHeading"
              id="outline-heading"
              class="ag-outlines__heading"
              tabindex="-1"
            >
              What is this?
            </h2>
            <div class="ag-outlines__list">
              <CdxCard
                v-for="outline in sortedOutlines"
                :key="outline.title"
                class="ag-card ag-card--interactive"
                :class="{ 'ag-card--selected': selectedType === outline.articleType }"
                :icon="cdxIconArticle"
                role="button"
                tabindex="0"
                :aria-pressed="selectedType === outline.articleType"
                @click="selectOutline(outline)"
                @keydown.enter.prevent="selectOutline(outline)"
                @keydown.space.prevent="selectOutline(outline)"
              >
                <template #title>{{ outline.label }}</template>
                <template #description>{{ outline.description }}</template>
              </CdxCard>
            </div>
            <p class="ag-selection-announcement" aria-live="polite">
              <template v-if="selectedType">
                Selected
                {{ sortedOutlines.find((item) => item.articleType === selectedType)?.label }}
              </template>
            </p>
          </section>

          <template v-else>
            <div class="ag-results">
              <div
                v-if="presentation.kind === 'loading'"
                class="ag-search-status"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <CdxProgressIndicator class="ag-search-status__progress" show-label>
                  {{ presentation.message }}
                </CdxProgressIndicator>
              </div>

              <template v-else-if="presentation.kind === 'results'">
                <h2 class="ag-results__heading">What is this?</h2>
                <p v-if="hasFallbackLabels" class="ag-results__fallback-language">
                  Some results are shown in another language
                </p>
                <div class="ag-results__list">
                  <CdxCard
                    v-for="result in visibleResults"
                    :key="result.id"
                    class="ag-card ag-card--interactive"
                    :url="result.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    :thumbnail="cardThumbnail(result.thumbnail)"
                    force-thumbnail
                  >
                    <template #title>
                      <span class="ag-card__title">
                        {{ result.label }}
                        <template v-if="result.outlineName">
                          <span class="ag-card__separator">·</span>
                          <span class="ag-card__outline">{{ result.outlineName }}</span>
                        </template>
                      </span>
                    </template>
                    <template v-if="result.description" #description>
                      {{ result.description }}
                    </template>
                  </CdxCard>
                </div>
              </template>

              <p v-else-if="presentation.kind === 'no-results'" class="ag-state-message">
                No subjects found for "{{ searchQuery }}"
              </p>

              <template v-else-if="presentation.kind === 'error'">
                <CdxMessage class="ag-search-error" type="error" inline>
                  Couldn't check this subject.
                </CdxMessage>
                <CdxButton action="progressive" weight="quiet" @click="performSearch()">
                  Try again
                </CdxButton>
              </template>
            </div>

            <footer v-if="presentation.showBrowseFallback" class="ag-search-footer">
              <div class="ag-browse">
                <span>Subject unavailable?</span>
                <CdxButton
                  ref="browseTrigger"
                  class="ag-search-footer__link"
                  action="progressive"
                  weight="quiet"
                  @click="browseOutlines"
                >
                  Pick a type instead
                </CdxButton>
              </div>
            </footer>
          </template>
        </div>
      </div>
    </div>
  </ChromeWrapper>
</template>

<style scoped>
.ag-prototype {
  width: 100%;
  max-width: 64rem;
  min-height: calc(100vh - 3rem);
  margin: 0 auto;
  color: var(--color-base);
  background-color: var(--background-color-base);
}

@supports (height: 100svh) {
  .ag-prototype {
    min-height: calc(100svh - 3rem);
  }
}

.ag-step-header {
  border-bottom: 1px solid var(--border-color-subtle);
}

.ag-step-header__inner {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  min-height: 44px;
}

.ag-step-header__back {
  padding: 0 var(--spacing-50);
}

.ag-step-header__title {
  justify-self: center;
  margin: 0;
  border: 0;
  color: var(--color-base);
  font-family: var(--font-family-base);
  font-size: var(--font-size-large);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-large);
  text-align: center;
}

.ag-step-header__spacer {
  justify-self: end;
}

.ag-step-body {
  padding: clamp(16px, 2vw, 24px) clamp(16px, 3vw, 32px) clamp(16px, 3vw, 32px);
}

.ag-step-header__inner,
.ag-step-content {
  max-width: 40rem;
}

.ag-search-controls,
.ag-results,
.ag-search-footer {
  width: 100%;
  max-width: 40rem;
  margin-inline-end: auto;
}

.ag-search-input {
  width: 100%;
  font-family: var(--font-family-serif);
}

.ag-search-input :deep(.cdx-text-input__input) {
  border: 0;
  border-bottom: 1px solid var(--border-color-base);
  border-radius: 0;
  box-shadow: none;
  outline: 0;
  font-family: var(--font-family-serif);
  font-size: var(--font-size-x-large);
  line-height: var(--line-height-x-large);
  caret-color: var(--color-progressive);
}

.ag-search-input :deep(.cdx-text-input__input:hover) {
  border-bottom-color: var(--border-color-base);
}

.ag-search-input :deep(.cdx-text-input__input:focus),
.ag-search-input :deep(.cdx-text-input__input:focus-visible) {
  border-bottom: 2px solid var(--color-progressive);
  box-shadow: none;
  outline: 0;
}

.ag-search-input :deep(.cdx-text-input__input::placeholder) {
  color: var(--color-subtle);
  opacity: 0.5;
}

.ag-results {
  margin-block-start: var(--spacing-100);
}

.ag-search-status {
  position: relative;
  width: 100%;
  max-width: 28rem;
  min-width: 0;
  margin-block-start: var(--spacing-150);
  padding-inline-start: calc(var(--spacing-50) + var(--size-icon-medium) + var(--spacing-50));
}

.ag-search-status__progress {
  display: block;
}

.ag-search-status__progress :deep(.cdx-progress-indicator__indicator) {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: var(--spacing-50);
  width: var(--size-icon-medium);
  min-width: var(--size-icon-medium);
}

.ag-search-status__progress :deep(.cdx-progress-indicator__label),
.ag-search-status__progress :deep(.cdx-label__label__text) {
  display: block;
  min-width: 0;
  margin-inline: 0;
  color: var(--color-base);
  font-size: var(--font-size-medium);
  line-height: var(--line-height-medium);
  white-space: normal;
  overflow-wrap: anywhere;
}

.ag-results__heading,
.ag-outlines__heading {
  margin: 0 0 var(--spacing-50);
  border: 0;
  font-family: var(--font-family-base);
  font-size: var(--font-size-x-large);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-x-large);
}

.ag-results__fallback-language {
  margin: 0 0 var(--spacing-75);
  color: var(--color-subtle);
}

.ag-results__list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--spacing-75);
}

.ag-card {
  min-width: 0;
  transition: background-color 0.2s;
}

.ag-card--interactive {
  cursor: pointer;
}

.ag-card--interactive:hover {
  background-color: var(--background-color-interactive-subtle);
}

.ag-card--interactive:active {
  background-color: var(--background-color-interactive);
}

.ag-card--interactive:focus-visible,
.ag-card--selected {
  outline: 2px solid var(--color-progressive);
  outline-offset: 2px;
}

.ag-card__title {
  display: inline;
}

.ag-card__separator,
.ag-card__outline {
  color: var(--color-subtle);
}

.ag-card__separator {
  margin: 0 var(--spacing-25);
}

.ag-state-message {
  min-width: 0;
  margin: 0;
  color: var(--color-subtle);
  overflow-wrap: anywhere;
}

.ag-search-error {
  max-width: 100%;
  margin-bottom: var(--spacing-50);
}

.ag-search-footer {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-100);
  margin-block-start: var(--spacing-150);
}

.ag-browse {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-25);
}

.ag-browse > :first-child {
  color: var(--color-base);
}

.ag-search-footer__link.cdx-button {
  min-height: auto;
  padding: 0;
  color: var(--color-progressive);
  font-size: inherit;
  font-weight: var(--font-weight-normal);
}

.ag-outlines {
  margin-top: var(--spacing-100);
}

.ag-outlines__desktop-back {
  display: none;
}

.ag-outlines__heading {
  margin-top: var(--spacing-25);
  margin-bottom: var(--spacing-100);
}

.ag-outlines__list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-75);
}

.ag-selection-announcement {
  min-height: var(--line-height-medium);
  margin-top: var(--spacing-150);
  color: var(--color-subtle);
}

@media (prefers-reduced-motion: reduce) {
  .ag-card {
    transition: none;
  }
}

.ag-prototype[data-skin='desktop'] .ag-step-header__inner {
  display: block;
  max-width: none;
  margin: 0;
}

.ag-prototype[data-skin='desktop'] {
  margin-top: var(--spacing-50);
}

.ag-prototype[data-skin='desktop'] .ag-step-header__back,
.ag-prototype[data-skin='desktop'] .ag-step-header__spacer {
  display: none;
}

.ag-prototype[data-skin='desktop'] .ag-step-header__title {
  justify-self: stretch;
  padding: 4px 0 var(--spacing-50);
  font-family: var(--font-family-serif);
  font-size: var(--font-size-xxx-large);
  font-weight: var(--font-weight-normal);
  line-height: var(--line-height-xxx-large);
  text-align: left;
}

.ag-prototype[data-skin='desktop'] .ag-step-body {
  padding: var(--spacing-75) 0 0;
}

.ag-prototype[data-skin='desktop'] .ag-step-content {
  max-width: none;
  margin: 0;
}

.ag-prototype[data-skin='desktop'] .ag-results__list {
  grid-template-columns: 1fr;
}

.ag-prototype[data-skin='desktop'] .ag-search-footer {
  flex-direction: row;
  align-items: center;
  gap: var(--spacing-25);
}

.ag-prototype[data-skin='desktop'] .ag-outlines__list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--spacing-100);
}

.ag-prototype[data-skin='desktop'] .ag-outlines__desktop-back {
  display: inline-flex;
  margin-bottom: var(--spacing-50);
}

.ag-prototype[data-skin='desktop'] .ag-outlines__list .ag-card {
  min-height: 80px;
}

.ag-prototype[data-skin='desktop'] .ag-outlines__list :deep(.cdx-card__description) {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
</style>

<script setup lang="ts">
import { computed, inject } from 'vue'

import ArticleHeader from './ArticleHeader.vue'
import { globalSkin, globalTheme, PROTOWIKI_CHROME_SKIN, PROTOWIKI_CHROME_THEME } from '@/theme'
import type { Skin, Theme } from '@/theme'

interface Props {
  lang?: string
  dir?: 'ltr' | 'rtl'
  /**
   * Title string **`ArticleHeader`** derives from when **`header`** is **`undefined`** (underscores → spaces).
   */
  title?: string
  /**
   * Reader-visible **`ArticleHeader`** override. **`undefined`** → derive from **`title`**.
   */
  header?: string
  skin?: Skin
  theme?: Theme
  /** Passed to **`ArticleHeader`** interlanguage control (**`N` languages**). */
  languagesCount?: number
}

const props = withDefaults(defineProps<Props>(), {
  lang: undefined,
  dir: undefined,
  title: 'Article',
  header: undefined,
  skin: undefined,
  theme: undefined,
  languagesCount: undefined,
})

const inheritedSkin = inject(PROTOWIKI_CHROME_SKIN)
const inheritedTheme = inject(PROTOWIKI_CHROME_THEME)

const effectiveSkin = computed<Skin>(() => props.skin ?? inheritedSkin?.value ?? globalSkin.value)
const effectiveTheme = computed<Theme>(
  () => props.theme ?? inheritedTheme?.value ?? globalTheme.value,
)

const derivedHeader = computed(() => (props.title ?? '').replace(/_/g, ' ').trim())

/** Non-empty string for **`ArticleHeader`** (explicit **`header`** wins, else **`title`**, else fallback). */
const chromeHeaderLabel = computed(() => {
  const explicit = props.header?.trim()
  if (explicit) return explicit
  const derived = derivedHeader.value.trim()
  if (derived) return derived
  return 'Article'
})
</script>

<template>
  <article
    class="article"
    :data-skin="effectiveSkin"
    :data-theme="effectiveTheme"
    :lang="props.lang"
    :dir="props.dir"
  >
    <ArticleHeader
      :title="chromeHeaderLabel"
      :languages-count="props.languagesCount"
      :skin="props.skin"
    />
    <slot />
  </article>
</template>

<style scoped>
.article {
  min-width: 0;
  width: 100%;
  padding: var(--spacing-150, 24px) 0;
  text-align: start;
  background-color: var(--background-color-base);
}

.article[data-skin='desktop'] {
  max-width: 984px;
  margin-inline: auto;
}

.article[data-skin='mobile'] {
  padding-inline: 0;
  padding-block-end: var(--spacing-100, 16px);
  padding-block-start: var(--spacing-150, 24px);
}
</style>

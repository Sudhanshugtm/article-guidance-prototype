<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

definePage({
  meta: {
    hidden: true,
  },
})

const route = useRoute()
const router = useRouter()

onMounted(() => {
  void router.replace({
    path: '/article-guidance',
    query: route.query,
    hash: route.hash,
  })
})
</script>

<template>
  <span class="root-redirect" aria-live="polite">Opening prototype…</span>
</template>

<style scoped>
.root-redirect {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>

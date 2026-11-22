<template>
  <button
    v-if="can('udpProbe')"
    type="button"
    class="shrink-0 cursor-pointer text-xs tabular-nums"
    :class="
      active
        ? 'text-primary-content'
        : result
          ? result.alive
            ? 'text-success'
            : 'text-error'
          : 'text-base-content/50'
    "
    :title="title"
    :aria-label="title"
    :disabled="loading"
    data-testid="udp-probe"
    @click.stop="probe"
  >
    {{ loading ? 'UDP …' : result ? (result.alive ? `UDP ${result.delay}ms` : 'UDP ×') : 'UDP ?' }}
  </button>
</template>

<script setup lang="ts">
import { can } from '@/assembly/backend'
import { fetchProxies } from '@/assembly/proxies/actions'
import { getUDPResult, getUDPTestOptions, testUDP } from '@/assembly/proxies/udp'
import { notifyRequestError } from '@/helper/request-error'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ name: string; groupName?: string; active?: boolean }>()
const { t } = useI18n()
const loading = ref(false)
const result = computed(() => getUDPResult(props.name, props.groupName))
const title = computed(() => {
  const options = getUDPTestOptions(props.name, props.groupName)
  const status = result.value
    ? result.value.alive
      ? t('udpProbe.passed')
      : t('udpProbe.failed')
    : t('udpProbe.unknown')
  return `${status}\n${options.server}:${options.port} · ${options.domain}\n${t('udpProbe.test')}`
})
const probe = async () => {
  if (loading.value) return
  loading.value = true
  try {
    await testUDP(props.name, props.groupName)
  } catch (error) {
    notifyRequestError(error)
  } finally {
    await fetchProxies().catch(() => {})
    loading.value = false
  }
}
</script>

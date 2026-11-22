<template>
  <div
    class="flex min-w-0 items-center gap-1.5 whitespace-nowrap"
    :title="rule.title"
  >
    <span
      v-if="rule.index"
      class="shrink-0 text-xs opacity-50"
      >{{ rule.index }}</span
    >
    <span
      class="truncate"
      :class="!info.rule && 'opacity-50'"
      >{{ rule.text }}</span
    >
  </div>
</template>

<script setup lang="ts">
import type { DnsRequestInfo } from '@/api/dns'
import { dnsRule } from '@/helper/dns-display'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
const props = defineProps<{ info: DnsRequestInfo }>()
const { t } = useI18n()
const rule = computed(() => dnsRule(props.info, t))
</script>

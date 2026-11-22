<template>
  <div data-testid="dns-column-settings">
    <div class="mb-3 flex items-center justify-between">
      <span>{{ t('customTableColumns') }}</span>
      <button
        class="btn btn-ghost btn-xs"
        @click="dnsColumns = [...defaultDnsColumns]"
      >
        {{ t('reset') }}
      </button>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div class="space-y-2">
        <div class="text-xs opacity-60">{{ t('activeLabel') }}</div>
        <Draggable
          v-model="dnsColumns"
          class="bg-base-200 flex min-h-24 flex-col gap-2 rounded-lg p-2"
          :animation="150"
          :item-key="(id: string) => id"
          handle=".dns-column-handle"
        >
          <template #item="{ element }">
            <div class="bg-base-100 flex items-center gap-2 rounded-lg p-2 text-sm shadow-sm">
              <Bars2Icon class="dns-column-handle size-4 shrink-0 cursor-move opacity-50" />
              <span class="min-w-0 flex-1 truncate">{{
                t(dnsColumnLabels[element as DnsColumn])
              }}</span>
              <button
                class="btn btn-ghost btn-circle btn-xs"
                :aria-label="`${t('dnsPage.hideColumn')} ${t(dnsColumnLabels[element as DnsColumn])}`"
                @click="dnsColumns = dnsColumns.filter((key) => key !== element)"
              >
                <XMarkIcon class="size-4" />
              </button>
            </div>
          </template>
        </Draggable>
      </div>
      <div class="space-y-2">
        <div class="text-xs opacity-60">{{ t('availableLabel') }}</div>
        <div
          class="border-base-300 flex min-h-24 flex-col gap-2 rounded-lg border border-dashed p-2"
        >
          <button
            v-for="key in available"
            :key="key"
            class="btn btn-ghost btn-sm flex-nowrap justify-between"
            :aria-label="`${t('dnsPage.showColumn')} ${t(dnsColumnLabels[key])}`"
            @click="dnsColumns = [...dnsColumns, key]"
          >
            <span class="truncate">{{ t(dnsColumnLabels[key]) }}</span
            ><PlusIcon class="size-4 shrink-0 opacity-50" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defaultDnsColumns, dnsColumnLabels, dnsColumns, type DnsColumn } from '@/store/dns'
import { Bars2Icon, PlusIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Draggable from 'vuedraggable'
const { t } = useI18n()
const available = computed(() =>
  (Object.keys(dnsColumnLabels) as DnsColumn[]).filter((key) => !dnsColumns.value.includes(key)),
)
</script>

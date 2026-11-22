<template>
  <article
    class="base-container flex min-w-0 flex-col p-4"
    data-testid="dns-server-card"
  >
    <div class="mb-4 flex items-center gap-3">
      <div
        v-if="server.icon?.trim() || $slots.icon"
        class="bg-base-200 flex size-9 shrink-0 items-center justify-center rounded-xl"
        data-testid="dns-server-icon"
      >
        <slot name="icon"
          ><ProxyIcon
            v-if="server.icon?.trim()"
            :icon="server.icon.trim()"
            :size="24"
            :margin="0"
        /></slot>
      </div>
      <div class="min-w-0 flex-1">
        <h2
          class="truncate font-semibold"
          :title="server.tag"
        >
          {{ server.tag }}
        </h2>
        <p
          v-if="server.scope"
          class="truncate text-xs opacity-50"
          :title="server.scope"
        >
          {{ server.scope }}
        </p>
      </div>
      <span
        v-if="server.default"
        class="badge badge-ghost badge-sm"
        :title="t('dnsPage.finalHint')"
        >{{ t('dnsPage.defaultServer') }}</span
      >
      <span class="badge badge-sm">{{ transportLabel }}</span>
      <button
        class="btn btn-ghost btn-circle btn-sm shrink-0"
        :disabled="busy"
        :aria-label="`${t('dnsPage.clearServer')} ${server.tag}`"
        @click="emit('clear')"
      >
        <TrashIcon class="size-4" />
      </button>
    </div>
    <dl class="flex-1 space-y-3 text-sm">
      <div v-if="server.type === 'race'">
        <dt class="mb-1 text-xs opacity-50">{{ t('dnsPage.members') }}</dt>
        <dd
          class="space-y-1"
          data-testid="dns-race-members"
        >
          <div
            v-for="member in server.dependencies"
            :key="member"
            class="truncate"
            :title="member"
          >
            {{ member }}
          </div>
        </dd>
      </div>
      <div v-else>
        <dt class="mb-1 text-xs opacity-50">{{ t('dnsPage.address') }}</dt>
        <dd class="break-all">{{ server.address || '—' }}</dd>
      </div>
      <div
        v-if="server.type !== 'race'"
        data-testid="dns-dialer"
      >
        <dt class="mb-1 text-xs opacity-50">{{ t('dnsPage.dialer') }}</dt>
        <dd>
          <DnsChain
            v-if="dialerChain.length"
            :nodes="dialerChain"
          /><span v-else>{{ dnsDialerLabel(server, t) }}</span>
        </dd>
      </div>
      <div v-if="server.type !== 'race'">
        <dt class="mb-1 text-xs opacity-50">{{ t('dnsPage.resolver') }}</dt>
        <dd
          class="truncate"
          :title="server.resolver"
        >
          {{ server.resolver || '—' }}
        </dd>
      </div>
    </dl>
    <dl
      class="border-base-300/60 mt-4 border-t pt-3 text-sm"
      data-testid="dns-cache-count"
    >
      <dt class="mb-1 text-xs opacity-50">{{ t('dnsPage.cacheCount') }}</dt>
      <dd class="tabular-nums">{{ server.cacheCount }}</dd>
    </dl>
  </article>
</template>

<script setup lang="ts">
import type { DnsServer } from '@/api/dns'
import ProxyIcon from '@/components/proxies/ProxyIcon.vue'
import { dnsDialerLabel } from '@/helper/dns-display'
import { TrashIcon } from '@heroicons/vue/24/outline'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import DnsChain from './DnsChain.vue'
const props = defineProps<{ server: DnsServer; busy: boolean }>()
const emit = defineEmits<{ clear: [] }>()
const { t } = useI18n()
const dialerChain = computed(() =>
  props.server.dialerChain?.length
    ? props.server.dialerChain
    : props.server.detour
      ? [props.server.detour]
      : [],
)
const transportLabel = computed(
  () =>
    ({ https: 'DoH', tls: 'DoT', h3: 'DoH3', quic: 'DoQ', udp: 'UDP', tcp: 'TCP', race: 'Race' })[
      props.server.type
    ] ?? props.server.type,
)
</script>

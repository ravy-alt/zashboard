<template>
  <div
    class="relative flex size-full flex-col overflow-hidden"
    data-testid="dns-page"
  >
    <CtrlsBar>
      <div class="flex flex-wrap items-center gap-2 p-2">
        <div
          role="tablist"
          class="tabs tabs-box mr-auto"
        >
          <button
            role="tab"
            class="tab"
            :class="{ 'tab-active': tab === 'cache' }"
            :aria-selected="tab === 'cache'"
            @click="tab = 'cache'"
          >
            {{ t('dnsPage.cache') }}
          </button>
          <button
            role="tab"
            class="tab"
            :class="{ 'tab-active': tab === 'servers' }"
            :aria-selected="tab === 'servers'"
            @click="tab = 'servers'"
          >
            {{ t('dnsPage.servers') }}
          </button>
        </div>
        <template v-if="tab === 'cache' && supported">
          <span
            class="text-xs opacity-60"
            role="status"
            >{{
              paused
                ? t('dnsPage.paused')
                : connected
                  ? t('dnsPage.live')
                  : t('dnsPage.reconnecting')
            }}</span
          >
          <button
            class="btn btn-ghost btn-square btn-sm"
            :title="t('dnsPage.clearAll')"
            :aria-label="t('dnsPage.clearAll')"
            :disabled="busy"
            @click="remove({})"
          >
            <TrashIcon class="size-5" />
          </button>
          <button
            class="btn btn-ghost btn-square btn-sm"
            :title="paused ? t('dnsPage.resume') : t('dnsPage.pause')"
            :aria-label="paused ? t('dnsPage.resume') : t('dnsPage.pause')"
            @click="paused = !paused"
          >
            <component
              :is="paused ? PlayIcon : PauseIcon"
              class="size-5"
            />
          </button>
        </template>
      </div>
      <div
        v-if="tab === 'cache' && supported"
        class="flex gap-2 px-3 pb-3"
      >
        <select
          v-model="serverFilter"
          class="select select-sm max-w-64"
          :aria-label="t('dnsPage.serverFilter')"
        >
          <option value="">{{ t('dnsPage.allServers') }}</option>
          <option
            v-for="server in filterServers"
            :key="server.key"
            :value="server.key"
          >
            {{ server.label }}
          </option>
        </select>
        <input
          v-model="search"
          class="input input-sm min-w-0 flex-1"
          type="search"
          :placeholder="t('dnsPage.search')"
          :aria-label="t('dnsPage.search')"
        />
        <span class="self-center text-xs tabular-nums"
          >{{ filteredEntries.length }} / {{ entries.size }}</span
        >
      </div>
    </CtrlsBar>
    <div
      class="flex min-h-0 flex-1 flex-col"
      :style="padding"
    >
      <p
        v-if="!supported"
        class="p-6 text-center opacity-70"
      >
        {{ t('dnsPage.unsupported') }}
      </p>
      <template v-else>
        <p
          v-if="error"
          role="alert"
          class="text-error px-3 py-2 text-sm"
        >
          {{ error }}
        </p>
        <template v-if="tab === 'cache'">
          <p class="px-3 py-2 text-xs opacity-60">{{ t('dnsPage.latestRequest') }}</p>
          <div
            ref="scrollElement"
            class="min-h-0 flex-1 overflow-auto"
            data-page-swipe-ignore
          >
            <div class="min-w-[1600px] text-xs">
              <div class="dns-grid bg-base-200 sticky top-0 z-10 gap-3 px-3 py-3 font-semibold">
                <span>{{ t('dnsPage.domain') }}</span
                ><span>{{ t('dnsPage.queryType') }}</span
                ><span>{{ t('dnsPage.answers') }}</span> <span>{{ t('dnsPage.source') }}</span
                ><span>{{ t('dnsPage.sourcePort') }}</span
                ><span>{{ t('dnsPage.destination') }}</span
                ><span>{{ t('dnsPage.destinationPort') }}</span> <span>{{ t('dnsPage.rule') }}</span
                ><span>{{ t('dnsPage.server') }}</span
                ><span>{{ t('dnsPage.expires') }}</span
                ><span>{{ t('dnsPage.lastUsed') }}</span
                ><span></span>
              </div>
              <div
                v-if="!filteredEntries.length"
                class="p-8 text-center opacity-50"
              >
                {{ t('dnsPage.empty') }}
              </div>
              <div :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
                <div
                  v-for="row in virtualRows"
                  :key="String(row.key)"
                  class="dns-grid border-base-300 hover:bg-base-200/40 absolute top-0 left-0 w-full items-center gap-3 border-b px-3"
                  :style="{ height: `${row.size}px`, transform: `translateY(${row.start}px)` }"
                  data-testid="dns-cache-row"
                >
                  <span
                    class="truncate font-medium"
                    :title="filteredEntries[row.index].domain"
                    >{{ filteredEntries[row.index].domain }}</span
                  >
                  <span
                    >{{ filteredEntries[row.index].type
                    }}<small
                      v-if="filteredEntries[row.index].clientSubnet"
                      class="block opacity-60"
                      :title="filteredEntries[row.index].clientSubnet"
                      >ECS</small
                    ></span
                  >
                  <span
                    class="line-clamp-3 break-all"
                    :title="filteredEntries[row.index].answers.join('\n')"
                    >{{ answers(filteredEntries[row.index]) }}</span
                  >
                  <span
                    class="truncate"
                    :title="filteredEntries[row.index].request.source"
                    >{{ filteredEntries[row.index].request.source || '—' }}</span
                  >
                  <span>{{ filteredEntries[row.index].request.sourcePort || '—' }}</span>
                  <span
                    class="truncate"
                    :title="filteredEntries[row.index].request.destination"
                    >{{ filteredEntries[row.index].request.destination || '—' }}</span
                  >
                  <span>{{ filteredEntries[row.index].request.destinationPort || '—' }}</span>
                  <span
                    class="line-clamp-3 break-all"
                    :title="ruleLabel(filteredEntries[row.index].request)"
                    >{{ ruleLabel(filteredEntries[row.index].request) }}</span
                  >
                  <span
                    class="line-clamp-3 break-all"
                    :title="serverLabel(filteredEntries[row.index])"
                    >{{ serverLabel(filteredEntries[row.index]) }}</span
                  >
                  <span :title="formatDate(filteredEntries[row.index].expiresAt)">{{
                    expiry(filteredEntries[row.index])
                  }}</span>
                  <span
                    >{{ formatDate(filteredEntries[row.index].request.lastUsed)
                    }}<small class="block opacity-60">{{
                      t('dnsPage.hits', { count: filteredEntries[row.index].request.hits })
                    }}</small></span
                  >
                  <button
                    class="btn btn-ghost btn-square btn-xs"
                    :disabled="busy"
                    :aria-label="`${t('dnsPage.delete')} ${filteredEntries[row.index].domain} ${filteredEntries[row.index].type}`"
                    @click="remove({ id: filteredEntries[row.index].id })"
                  >
                    <TrashIcon class="size-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
        <div
          v-else
          class="flex-1 overflow-auto p-3"
        >
          <form
            class="base-container mb-3 space-y-3 p-4"
            @submit.prevent="runQuery"
          >
            <h2 class="font-semibold">{{ t('dnsPage.query') }}</h2>
            <div class="flex flex-wrap gap-2">
              <input
                v-model="domain"
                required
                class="input min-w-48 flex-1"
                :placeholder="t('dnsPage.domainPlaceholder')"
                :aria-label="t('dnsPage.domain')"
              />
              <select
                v-model="queryTypes"
                class="select w-auto"
                :aria-label="t('dnsPage.queryType')"
              >
                <option
                  v-for="type in types"
                  :key="type"
                  :value="type"
                >
                  {{ type.replace(',', ' + ') }}
                </option>
              </select>
              <select
                v-model="queryServer"
                class="select max-w-72"
                :aria-label="t('dnsPage.queryServer')"
              >
                <option value="">{{ t('dnsPage.byRules') }}</option>
                <option
                  v-for="server in servers"
                  :key="serverKey(server)"
                  :value="serverKey(server)"
                >
                  {{ qualified(server.tag, server.scope) }}
                </option>
              </select>
              <button
                class="btn btn-primary"
                type="submit"
                :disabled="querying || !domain.trim()"
              >
                {{ querying ? t('dnsPage.querying') : t('dnsPage.query') }}
              </button>
            </div>
            <div
              v-for="result in queryResults"
              :key="result.type"
              class="border-base-300 border-t pt-3"
              data-testid="dns-query-result"
            >
              <strong>{{ result.type }}</strong>
              <span
                v-if="result.error"
                class="text-error ml-3"
                >{{ result.error }}</span
              >
              <template v-else-if="result.data">
                <p class="mt-1 font-mono break-all">
                  {{
                    result.data.Answer?.map((answer) => answer.data).join(' · ') ||
                    t('dnsPage.noAnswer')
                  }}
                </p>
                <p class="mt-1 text-xs opacity-70">
                  {{ t('dnsPage.server') }}: {{ result.data.Server || '—' }} ·
                  {{ t('dnsPage.rule') }}: {{ ruleLabel(result.data.Trace) }} · RCODE:
                  {{ result.data.Status
                  }}<span v-if="result.data.Trace.cached"> · {{ t('dnsPage.cacheHit') }}</span>
                </p>
              </template>
            </div>
          </form>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-3">
            <article
              v-for="server in servers"
              :key="serverKey(server)"
              class="base-container p-4"
              data-testid="dns-server-card"
            >
              <div class="mb-3 flex items-center gap-2">
                <h2
                  class="min-w-0 flex-1 truncate font-semibold"
                  :title="qualified(server.tag, server.scope)"
                >
                  {{ qualified(server.tag, server.scope) }}
                </h2>
                <span class="badge badge-sm">{{ transportLabel(server.type) }}</span
                ><button
                  class="btn btn-ghost btn-square btn-sm"
                  :disabled="busy"
                  :aria-label="`${t('dnsPage.clearServer')} ${server.tag}`"
                  @click="remove({ scope: server.scope ?? '', server: server.tag })"
                >
                  <TrashIcon class="size-4" />
                </button>
              </div>
              <dl class="space-y-2 text-sm">
                <div>
                  <dt class="opacity-60">{{ t('dnsPage.address') }}</dt>
                  <dd class="break-all">{{ server.address || '—' }}</dd>
                </div>
                <div>
                  <dt class="opacity-60">{{ t('dnsPage.dialer') }}</dt>
                  <dd class="break-all">
                    {{ server.dialerChain?.join(' → ') || server.detour || t('dnsPage.direct') }}
                  </dd>
                </div>
                <div>
                  <dt class="opacity-60">{{ t('dnsPage.resolver') }}</dt>
                  <dd>{{ server.resolver || '—' }}</dd>
                </div>
                <div v-if="server.type === 'race'">
                  <dt class="opacity-60">{{ t('dnsPage.members') }}</dt>
                  <dd class="break-all">{{ server.dependencies.join(' · ') }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="opacity-60">{{ t('dnsPage.cacheCount') }}</dt>
                  <dd>
                    {{ server.cacheCount
                    }}<span
                      v-if="server.default"
                      class="ml-2 text-xs opacity-60"
                      >{{ t('dnsPage.defaultServer') }}</span
                    >
                  </dd>
                </div>
              </dl>
            </article>
          </div>
          <section class="base-container mt-3 p-4">
            <h2 class="mb-3 font-semibold">{{ t('dnsPage.rules') }}</h2>
            <ol class="divide-base-300 divide-y text-sm">
              <li
                v-for="rule in rules"
                :key="`${rule.scope}:${rule.index}`"
                class="flex flex-wrap gap-2 py-3"
              >
                <span class="opacity-50"
                  >{{ rule.index < 0 ? t('dnsPage.defaultServer') : rule.index + 1
                  }}<span v-if="rule.scope"> · {{ rule.scope }}</span></span
                ><span class="min-w-0 flex-1 break-all">{{ rule.match || t('dnsPage.any') }}</span
                ><code class="break-all">{{ rule.action }}</code>
              </li>
            </ol>
          </section>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  queryDns,
  type DnsCacheEntry,
  type DnsQueryResult,
  type DnsRequestInfo,
  type DnsServer,
} from '@/api/dns'
import CtrlsBar from '@/components/common/CtrlsBar.vue'
import { useDnsManagement } from '@/composables/use-dns-management'
import { usePaddingForViews } from '@/composables/use-padding-for-views'
import { getRequestErrorMessage } from '@/helper/request-error'
import { activeBackend } from '@/store/setup'
import { PauseIcon, PlayIcon, TrashIcon } from '@heroicons/vue/24/outline'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { padding } = usePaddingForViews({ offsetTop: 0, offsetBottom: 0 })
const { entries, servers, rules, paused, connected, error, busy, supported, remove } =
  useDnsManagement()
const tab = ref('cache')
const serverFilter = ref('')
const search = ref('')
const domain = ref('')
const queryTypes = ref('A,AAAA')
const queryServer = ref('')
const querying = ref(false)
const queryResults = ref<{ type: string; data?: DnsQueryResult; error?: string }[]>([])
const types = [
  'A,AAAA',
  'A',
  'AAAA',
  'CNAME',
  'HTTPS',
  'SVCB',
  'TXT',
  'MX',
  'NS',
  'SOA',
  'PTR',
  'SRV',
  'CAA',
]
const qualified = (name: string, scope?: string) => (scope ? `${name} · ${scope}` : name)
const serverKey = (server: Pick<DnsServer, 'tag' | 'scope'>) =>
  JSON.stringify([server.scope ?? '', server.tag])
const filterServers = computed(() => {
  const result = new Map(
    servers.value.map((server) => [serverKey(server), qualified(server.tag, server.scope)]),
  )
  for (const entry of entries.value.values())
    result.set(
      serverKey({ tag: entry.server, scope: entry.scope }),
      qualified(entry.server, entry.scope),
    )
  return [...result].map(([key, label]) => ({ key, label }))
})
const filteredEntries = computed(() => {
  const term = search.value.trim().toLocaleLowerCase()
  return [...entries.value.values()]
    .filter(
      (entry) =>
        (!serverFilter.value ||
          serverKey({ tag: entry.server, scope: entry.scope }) === serverFilter.value) &&
        (!term ||
          [
            entry.domain,
            ...entry.addresses,
            ...entry.answers,
            entry.request.source,
            entry.request.destination,
          ].some((value) => value?.toLocaleLowerCase().includes(term))),
    )
    .sort(
      (a, b) =>
        a.domain.localeCompare(b.domain) ||
        a.type.localeCompare(b.type) ||
        a.id.localeCompare(b.id),
    )
})
const scrollElement = ref<HTMLElement>()
const virtualizer = useVirtualizer(
  computed(() => ({
    count: filteredEntries.value.length,
    getScrollElement: () => scrollElement.value ?? null,
    estimateSize: () => 88,
    overscan: 8,
    getItemKey: (index: number) => filteredEntries.value[index].id,
  })),
)
const virtualRows = computed(() => virtualizer.value.getVirtualItems())
watch([search, serverFilter, tab], () => {
  scrollElement.value?.scrollTo({ top: 0 })
})
const answers = (entry: DnsCacheEntry) =>
  entry.addresses.length ? entry.addresses.join(' · ') : entry.answers.join(' · ') || entry.rcode
const formatDate = (date?: string | null) =>
  !date || date.startsWith('0001-') ? '—' : new Date(date).toLocaleString()
const now = ref(Date.now())
const clock = setInterval(() => {
  now.value = Date.now()
}, 1000)
const expiry = (entry: DnsCacheEntry) =>
  !entry.expiresAt
    ? t('dnsPage.noExpiry')
    : entry.stale
      ? t('dnsPage.stale')
      : `${Math.max(0, Math.ceil((Date.parse(entry.expiresAt) - now.value) / 1000))} s`
const ruleLabel = (info: DnsRequestInfo) => {
  const purpose =
    info.purpose && info.purpose !== 'client' ? t(`dnsPage.purpose.${info.purpose}`) : ''
  const rule =
    info.rule === 'default'
      ? t('dnsPage.defaultServer')
      : info.rule === 'manual-server'
        ? t('dnsPage.manualServer')
        : info.rule === 'specified-server'
          ? t('dnsPage.specifiedServer')
          : info.rule || '—'
  return [purpose, rule].filter(Boolean).join(' · ')
}
const serverLabel = (entry: DnsCacheEntry) =>
  qualified(entry.server, entry.scope) +
  (entry.request.server && entry.request.server !== entry.server
    ? ` → ${entry.request.server}`
    : '')
const transportLabel = (type: string) =>
  ({ https: 'DoH', tls: 'DoT', h3: 'DoH3', quic: 'DoQ', udp: 'UDP', tcp: 'TCP' })[type] ?? type
let queryController: AbortController | undefined
const resetQuery = () => {
  queryController?.abort()
  queryResults.value = []
  querying.value = false
  queryServer.value = ''
  serverFilter.value = ''
}
watch(activeBackend, resetQuery)
const runQuery = async () => {
  if (!supported.value) return
  queryController?.abort()
  queryController = new AbortController()
  const signal = queryController.signal
  querying.value = true
  queryResults.value = []
  const [scope, server] = queryServer.value
    ? (JSON.parse(queryServer.value) as [string, string])
    : ['', '']
  const name = domain.value.trim()
  const results = await Promise.all(
    queryTypes.value.split(',').map(async (type) => {
      try {
        return { type, data: await queryDns({ name, type, scope, server }, signal) }
      } catch (e) {
        return { type, error: getRequestErrorMessage(e) }
      }
    }),
  )
  if (!signal.aborted) {
    queryResults.value = results
    querying.value = false
  }
}
onScopeDispose(() => {
  clearInterval(clock)
  queryController?.abort()
})
</script>

<style scoped>
.dns-grid {
  display: grid;
  grid-template-columns:
    180px 60px minmax(180px, 1.4fr) 120px 65px 120px 65px minmax(180px, 1.2fr)
    145px 90px 150px 28px;
}
</style>

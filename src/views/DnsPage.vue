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
          <button
            class="btn btn-circle btn-sm"
            :title="t('dnsPage.tableSettings')"
            :aria-label="t('dnsPage.tableSettings')"
            @click="tableSettingsOpen = true"
          >
            <WrenchScrewdriverIcon class="size-4" />
          </button>
          <button
            class="btn btn-circle btn-sm"
            :title="t('dnsPage.clearAll')"
            :aria-label="t('dnsPage.clearAll')"
            :disabled="busy"
            @click="remove({})"
          >
            <TrashIcon class="size-4" />
          </button>
          <button
            class="btn btn-circle btn-sm"
            :title="paused ? t('dnsPage.resume') : t('dnsPage.pause')"
            :aria-label="paused ? t('dnsPage.resume') : t('dnsPage.pause')"
            @click="paused = !paused"
          >
            <component
              :is="paused ? PlayIcon : PauseIcon"
              class="size-4"
            />
          </button>
        </template>
        <button
          v-if="tab === 'servers' && supported"
          class="btn btn-circle btn-sm"
          :title="t('refresh')"
          :aria-label="t('refresh')"
          :disabled="refreshing"
          @click="refreshServers()"
        >
          <ArrowPathIcon
            class="size-4"
            :class="{ 'animate-spin': refreshing }"
          />
        </button>
      </div>
      <div
        v-if="tab === 'cache' && supported"
        class="flex gap-2 px-3 pb-3"
      >
        <select
          v-model="serverFilter"
          class="select select-sm w-32 shrink-0 sm:w-64"
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
    <DialogWrapper
      v-model="tableSettingsOpen"
      :title="t('dnsPage.tableSettings')"
      ><DnsTableSettings
    /></DialogWrapper>
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
        <DnsCacheTable
          v-if="tab === 'cache'"
          :entries="filteredEntries"
          :busy="busy"
          @remove="(id) => remove({ id })"
        />
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
                <div class="mt-1 space-y-1 font-mono break-all">
                  <div
                    v-for="(answer, index) in result.data.Answer"
                    :key="index"
                  >
                    {{ answer.data }}
                  </div>
                  <span v-if="!result.data.Answer?.length">{{ t('dnsPage.noAnswer') }}</span>
                </div>
                <p class="mt-1 text-xs opacity-70">
                  {{ t('dnsPage.server') }}: {{ result.data.Server || '—' }} ·
                  {{ t('dnsPage.rule') }}: {{ dnsRule(result.data.Trace, t).text }} · RCODE:
                  {{ result.data.Status
                  }}<span v-if="result.data.Trace.cached"> · {{ t('dnsPage.cacheHit') }}</span>
                </p>
              </template>
            </div>
          </form>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-3">
            <DnsServerCard
              v-for="server in servers"
              :key="serverKey(server)"
              :server="server"
              :busy="busy"
              @clear="remove({ scope: server.scope ?? '', server: server.tag })"
            />
          </div>
          <section class="base-container mt-3 p-4">
            <h2 class="mb-3 font-semibold">{{ t('dnsPage.rules') }}</h2>
            <ol class="divide-base-300 divide-y text-sm">
              <li
                v-for="rule in rules"
                :key="`${rule.scope}:${rule.index}`"
                class="flex flex-wrap gap-2 py-3"
              >
                <span
                  v-if="rule.index >= 0 || rule.scope"
                  class="opacity-50"
                  >{{ rule.index < 0 ? '' : `#${rule.index + 1}`
                  }}<span
                    v-if="rule.scope"
                    class="ml-1"
                    >{{ rule.scope }}</span
                  ></span
                ><span class="min-w-0 flex-1 break-all">{{
                  rule.match === 'default'
                    ? t('dnsPage.defaultRule')
                    : rule.match || t('dnsPage.any')
                }}</span
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
import { queryDns, type DnsQueryResult, type DnsServer } from '@/api/dns'
import CtrlsBar from '@/components/common/CtrlsBar.vue'
import DialogWrapper from '@/components/common/DialogWrapper.vue'
import DnsCacheTable from '@/components/dns/DnsCacheTable.vue'
import DnsServerCard from '@/components/dns/DnsServerCard.vue'
import DnsTableSettings from '@/components/dns/DnsTableSettings.vue'
import { dnsAnswerLines, dnsDomain, dnsRule } from '@/helper/dns-display'
import { useDnsManagement } from '@/composables/use-dns-management'
import { usePaddingForViews } from '@/composables/use-padding-for-views'
import { getRequestErrorMessage } from '@/helper/request-error'
import { activeBackend } from '@/store/setup'
import {
  ArrowPathIcon,
  PauseIcon,
  PlayIcon,
  TrashIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/vue/24/outline'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { padding } = usePaddingForViews({ offsetTop: 0, offsetBottom: 0 })
const {
  entries,
  servers,
  rules,
  paused,
  error,
  busy,
  refreshing,
  supported,
  remove,
  refreshServers,
} = useDnsManagement()
const tab = ref('cache')
watch(tab, (value) => {
  if (value === 'servers') void refreshServers()
})
const tableSettingsOpen = ref(false)
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
  return [...entries.value.values()].filter(
    (entry) =>
      (!serverFilter.value ||
        serverKey({ tag: entry.server, scope: entry.scope }) === serverFilter.value) &&
      (!term ||
        [
          dnsDomain(entry.domain),
          ...dnsAnswerLines(entry),
          ...entry.addresses,
          ...entry.answers,
          entry.request.source,
          entry.request.destination,
        ].some((value) => value?.toLocaleLowerCase().includes(term))),
  )
})
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
  queryController?.abort()
})
</script>

<template>
  <VirtualTable
    :data="entries"
    :columns="columns"
    :column-visibility="visibility"
    sorting-key="config/dns-table-sort"
    :initial-sorting="[{ id: 'host', desc: false }]"
    :get-row-id="(entry: DnsCacheEntry) => entry.id"
    :estimate-size="44"
    :overscan="12"
    resizable
    dynamic-row-height
    pin-first-column
    row-test-id="dns-cache-row"
  />
</template>

<script setup lang="ts">
import type { DnsCacheEntry } from '@/api/dns'
import VirtualTable from '@/components/common/VirtualTable.vue'
import {
  dnsAnswerLines,
  dnsDate,
  dnsDomain,
  dnsPurpose,
  dnsRule,
  dnsServerChain,
} from '@/helper/dns-display'
import { dnsColumnLabels, dnsColumns, type DnsColumn } from '@/store/dns'
import { XMarkIcon } from '@heroicons/vue/24/outline'
import type { AccessorFnColumnDef, ColumnDef } from '@tanstack/vue-table'
import { computed, h, onScopeDispose, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import DnsChain from './DnsChain.vue'
import DnsRuleCell from './DnsRuleCell.vue'

const props = defineProps<{ entries: DnsCacheEntry[]; busy: boolean }>()
const emit = defineEmits<{ remove: [id: string] }>()
const { t } = useI18n()
const now = ref(Date.now())
const clock = setInterval(() => {
  now.value = Date.now()
}, 1000)
onScopeDispose(() => clearInterval(clock))
const expiry = (entry: DnsCacheEntry) =>
  !entry.expiresAt
    ? t('dnsPage.noExpiry')
    : entry.stale
      ? t('dnsPage.stale')
      : `${Math.max(0, Math.ceil((Date.parse(entry.expiresAt) - now.value) / 1000))} s`

const definitions: Record<DnsColumn, Omit<AccessorFnColumnDef<DnsCacheEntry>, 'id'>> = {
  host: {
    accessorFn: (e) => dnsDomain(e.domain),
    size: 260,
    cell: ({ row }) =>
      dnsDomain(row.original.domain) === '.'
        ? `${t('dnsPage.rootDomain')} (.)`
        : row.original.domain,
  },
  type: { accessorFn: (e) => e.type, size: 80 },
  answers: {
    accessorFn: (e) => dnsAnswerLines(e).join('\n'),
    size: 240,
    cell: ({ row }) =>
      h(
        'div',
        { class: 'space-y-0.5 py-1', 'data-testid': 'dns-answers' },
        dnsAnswerLines(row.original).map((line, i) =>
          h('div', { class: 'truncate', title: line, key: i }, line),
        ),
      ),
  },
  sourcePort: { accessorFn: (e) => e.request.sourcePort || undefined, size: 100 },
  sourceIP: { accessorFn: (e) => e.request.source || undefined, size: 160 },
  destinationIP: { accessorFn: (e) => e.request.destination || undefined, size: 160 },
  destinationPort: { accessorFn: (e) => e.request.destinationPort || undefined, size: 100 },
  purpose: {
    accessorFn: (e) => dnsPurpose(e.request, t),
    size: 130,
    cell: ({ row }) =>
      h('span', { class: 'text-base-content/65' }, dnsPurpose(row.original.request, t)),
  },
  rule: {
    accessorFn: (e) => dnsRule(e.request, t).text,
    size: 320,
    meta: { noCellTitle: true },
    cell: ({ row }) => h(DnsRuleCell, { info: row.original.request }),
  },
  server: {
    accessorFn: (e) => dnsServerChain(e).join(' → '),
    size: 250,
    meta: { noCellTitle: true },
    cell: ({ row }) =>
      h('div', { title: row.original.scope, class: 'flex min-w-0 items-center gap-2' }, [
        h(DnsChain, { nodes: dnsServerChain(row.original) }),
        row.original.scope
          ? h(
              'span',
              { class: 'max-w-24 shrink-0 truncate text-xs opacity-50' },
              row.original.scope,
            )
          : null,
      ]),
  },
  expires: {
    accessorFn: (e) => (e.expiresAt ? Date.parse(e.expiresAt) : Infinity),
    size: 120,
    cell: ({ row }) =>
      h(
        'span',
        { title: dnsDate(row.original.expiresAt), class: 'tabular-nums' },
        expiry(row.original),
      ),
  },
  lastUsed: {
    accessorFn: (e) =>
      e.request.lastUsed.startsWith('0001-') ? 0 : Date.parse(e.request.lastUsed),
    size: 190,
    cell: ({ row }) => dnsDate(row.original.request.lastUsed),
  },
  hits: { accessorFn: (e) => e.request.hits, size: 100 },
}

const visibility = computed(() =>
  Object.fromEntries(
    Object.keys(definitions).map((key) => [key, dnsColumns.value.includes(key as DnsColumn)]),
  ),
)
const columns = computed<ColumnDef<DnsCacheEntry>[]>(() => [
  {
    id: 'delete',
    header: () => t('dnsPage.clear'),
    size: 60,
    minSize: 60,
    maxSize: 60,
    enableSorting: false,
    enableResizing: false,
    cell: ({ row }) =>
      h(
        'button',
        {
          class: 'btn btn-xs btn-circle',
          disabled: props.busy,
          title: t('dnsPage.delete'),
          'aria-label': `${t('dnsPage.delete')} ${dnsDomain(row.original.domain)} ${row.original.type}`,
          onClick: (event: MouseEvent) => {
            event.stopPropagation()
            emit('remove', row.original.id)
          },
        },
        [h(XMarkIcon, { class: 'size-4' })],
      ),
  },
  ...[...new Set([...dnsColumns.value, ...(Object.keys(definitions) as DnsColumn[])])]
    .filter((key) => key in definitions)
    .map((key) => ({
      id: key,
      header: () => t(dnsColumnLabels[key]),
      cell: ({ getValue }: { getValue: () => unknown }) => getValue() ?? '—',
      ...definitions[key],
    })),
])
</script>

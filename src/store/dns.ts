import { useStorage } from '@/composables/use-storage'

export const dnsColumnLabels = {
  host: 'host',
  type: 'type',
  answers: 'destination',
  sourcePort: 'sourcePort',
  sourceIP: 'sourceIP',
  destinationIP: 'dnsPage.destinationIP',
  destinationPort: 'dnsPage.destinationPort',
  purpose: 'dnsPage.purposeLabel',
  rule: 'rule',
  server: 'dnsPage.server',
  expires: 'dnsPage.expires',
  lastUsed: 'dnsPage.lastUsed',
  hits: 'dnsPage.hitCount',
} as const

export type DnsColumn = keyof typeof dnsColumnLabels
export const defaultDnsColumns: DnsColumn[] = [
  'host',
  'type',
  'answers',
  'sourcePort',
  'sourceIP',
  'purpose',
  'rule',
  'server',
  'expires',
]
export const dnsColumns = useStorage<DnsColumn[]>('config/dns-table-columns', [
  ...defaultDnsColumns,
])

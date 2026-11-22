import type { DnsCacheEntry, DnsRequestInfo, DnsServer } from '@/api/dns'

type Translate = (key: string) => string

// Older DNS management backends stripped the root's only dot.
export const dnsDomain = (domain: string) => domain || '.'

export const dnsAnswerLines = (entry: DnsCacheEntry) => {
  if (entry.answerData?.length) return entry.answerData
  if (entry.addresses.length && ['A', 'AAAA'].includes(entry.type)) return entry.addresses
  if (entry.answers.length)
    return entry.answers.map((record) =>
      record.replace(/^(?:\\.|[^\s])+\s+\d+\s+(?:IN|CS|CH|HS|NONE|ANY|CLASS\d+)\s+\S+\s+/, ''),
    )
  if (entry.addresses.length) return entry.addresses
  return [entry.rcode === 'NOERROR' ? 'NODATA' : entry.rcode]
}

export const dnsPurpose = (info: DnsRequestInfo, t: Translate) =>
  info.purpose ? t(`dnsPage.purpose.${info.purpose}`) : t('dnsPage.notRecorded')

export const dnsRule = (info: DnsRequestInfo, t: Translate) => {
  const labels: Record<string, string> = {
    default: 'dnsPage.defaultRule',
    'manual-server': 'dnsPage.manualServer',
    'specified-server': 'dnsPage.specifiedServer',
  }
  const raw = info.rule || ''
  const indexed = /^(\d+):\s*([\s\S]*)$/.exec(raw)
  return {
    index: indexed ? `#${Number(indexed[1]) + 1}` : '',
    text: labels[raw] ? t(labels[raw]) : indexed?.[2] || raw || t('dnsPage.notRecorded'),
    title: raw === 'default' ? t('dnsPage.finalHint') : raw || t('dnsPage.notRecorded'),
  }
}

export const dnsServerChain = (entry: DnsCacheEntry) =>
  entry.request.server && entry.request.server !== entry.server
    ? [entry.server, entry.request.server]
    : [entry.server]

export const dnsDialerLabel = (server: DnsServer, t: Translate) => {
  if (['hosts', 'predefined', 'fakeip'].includes(server.type)) return t('dnsPage.noDialer')
  if (server.type === 'local') return t('dnsPage.systemResolver')
  if (['udp', 'tcp', 'tls', 'https', 'h3', 'quic', 'dhcp'].includes(server.type))
    return t('dnsPage.direct')
  return t('dnsPage.notRecorded')
}

export const dnsDate = (date?: string | null) =>
  !date || date.startsWith('0001-') ? '—' : new Date(date).toLocaleString()

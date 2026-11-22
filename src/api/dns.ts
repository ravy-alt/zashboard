import { getUrlFromBackend } from '@/helper/utils'
import type { Backend } from '@/types'
import axios from 'axios'
import './http'

export interface DnsRequestInfo {
  source?: string
  sourcePort?: number
  destination?: string
  destinationPort?: number
  purpose?: string
  rule?: string
  server?: string
  cached: boolean
  lastUsed: string
  hits: number
}

export interface DnsCacheEntry {
  id: string
  scope?: string
  server: string
  domain: string
  type: string
  class: number
  clientSubnet?: string
  answers: string[]
  addresses: string[]
  rcode: string
  expiresAt: string | null
  stale: boolean
  request: DnsRequestInfo
}

export interface DnsCacheFrame {
  full: boolean
  revision: number
  entries: DnsCacheEntry[]
  removed: string[]
}

export interface DnsServer {
  scope?: string
  tag: string
  type: string
  address: string
  detour?: string
  dialerChain: string[]
  resolver?: string
  dependencies: string[]
  cacheCount: number
  default: boolean
}

export interface DnsRule {
  scope?: string
  index: number
  match: string
  action: string
}

export interface DnsQueryResult {
  Status: number
  Server: string
  Trace: DnsRequestInfo
  Answer?: { name: string; type: number; TTL: number; data: string }[]
}

export const fetchDnsServers = (signal: AbortSignal) =>
  axios.get<{ servers: DnsServer[] }>('/dns/servers', { signal }).then((r) => r.data.servers)
export const fetchDnsRules = (signal: AbortSignal) =>
  axios.get<{ rules: DnsRule[] }>('/dns/rules', { signal }).then((r) => r.data.rules)
export const deleteDnsCache = (
  params: { id?: string; scope?: string; server?: string },
  signal: AbortSignal,
) => axios.delete<{ deleted: number }>('/dns/cache', { params, signal })
export const queryDns = (
  params: { name: string; type: string; scope?: string; server?: string },
  signal: AbortSignal,
) => axios.get<DnsQueryResult>('/dns/query', { params, signal, timeout: 15000 }).then((r) => r.data)

// DNS deltas must never be debounced: losing a frame loses cache entries until
// reconnect. A new connection always starts with a complete snapshot.
export const openDnsCache = (
  backend: Backend,
  onFrame: (frame: DnsCacheFrame) => void,
  onState: (connected: boolean) => void,
) => {
  const url = new URL(`${getUrlFromBackend(backend)}/dns/cache`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('token', backend.password || '')
  let socket: WebSocket | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let closed = false
  let revision = 0
  const connect = () => {
    if (closed) return
    revision = 0
    const current = new WebSocket(url)
    socket = current
    current.onmessage = ({ data }) => {
      if (closed || socket !== current) return
      try {
        const frame = JSON.parse(data) as DnsCacheFrame
        if (
          !Array.isArray(frame.entries) ||
          !Array.isArray(frame.removed) ||
          !Number.isSafeInteger(frame.revision) ||
          (!frame.full && (revision === 0 || frame.revision !== revision + 1))
        ) {
          current.close()
          return
        }
        revision = frame.revision
        onFrame(frame)
        onState(true)
      } catch {
        current.close()
      }
    }
    current.onclose = () => {
      if (closed || socket !== current) return
      onState(false)
      timer = setTimeout(connect, 2000)
    }
    current.onerror = () => current.close()
  }
  connect()
  return () => {
    closed = true
    clearTimeout(timer)
    if (socket) {
      socket.onmessage = socket.onclose = socket.onerror = null
      socket.close()
    }
  }
}

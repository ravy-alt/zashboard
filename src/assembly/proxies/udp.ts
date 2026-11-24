import '@/api/http'
import { can, core, Core } from '@/assembly/backend'
import type { UDPTestOptions, UDPTestResult, UDPTestSkipped } from '@/types'
import axios from 'axios'
import pLimit from 'p-limit'
import { getNowProxyNodeName, ipv6Cache, proxyMap } from './state'

const limit = pLimit(5)
const pending = new Map<string, Promise<void>>()

export const getUDPTestOptions = (name: string, groupName?: string): UDPTestOptions => {
  return (
    proxyMap.value[groupName ?? name]?.udpTest ?? {
      server: '8.8.8.8',
      port: 53,
      domain: 'example.com.',
      timeout: 5000,
    }
  )
}

const profileKey = (options: UDPTestOptions) =>
  JSON.stringify([
    options.server.toLowerCase(),
    options.port,
    options.domain.toLowerCase().replace(/\.$/, ''),
    options.timeout,
  ])

export const getUDPResult = (name: string, groupName?: string) => {
  if (!can('udpProbe')) return
  const leaf = getNowProxyNodeName(name)
  if (proxyMap.value[leaf]?.udp !== true) return
  const expected = profileKey(getUDPTestOptions(name, groupName))
  return Object.values(proxyMap.value[leaf]?.udpHistory ?? {}).find(
    (result) => result.outbound === leaf && profileKey(result) === expected,
  )
}

export const getUDPLabel = (name: string, groupName?: string) => {
  const node = proxyMap.value[name]
  const available = core.value === Core.SingBox ? getUDPResult(name, groupName)?.alive : node?.udp
  return available ? (node?.xudp ? 'xudp' : 'udp') : ''
}

// Results live in the core's leaf-scoped history. Never attach a response to
// the group/name that happened to be selected before an asynchronous request.
export const testUDP = (name: string, groupName?: string): Promise<void> => {
  if (!can('udpProbe')) return Promise.resolve()
  const leaf = getNowProxyNodeName(name)
  const node = proxyMap.value[leaf]
  if (!node || node.all !== undefined || node.udp !== true) return Promise.resolve()
  const options = getUDPTestOptions(name, groupName)
  const session = ipv6Cache.session
  const revision = node['x-sing-box-revision']
  const key = JSON.stringify([session, leaf, revision, profileKey(options)])
  const existing = pending.get(key)
  if (existing) return existing
  const request = limit(async () => {
    if (
      session !== ipv6Cache.session ||
      proxyMap.value[leaf]?.['x-sing-box-revision'] !== revision ||
      proxyMap.value[leaf]?.udp !== true
    )
      return
    await axios.get<UDPTestResult | UDPTestSkipped>(
      `/proxies/${encodeURIComponent(leaf)}/udp-delay`,
      {
        params: options,
        timeout: options.timeout + 2000,
      },
    )
  }).finally(() => {
    pending.delete(key)
  })
  pending.set(key, request)
  return request
}

export const testGroupUDP = (names: string[], groupName?: string) =>
  Promise.allSettled(names.map((name) => testUDP(name, groupName)))

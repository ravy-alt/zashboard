import { can } from '@/assembly/backend'
import { NOT_CONNECTED, PROXY_TYPE, TEST_URL } from '@/constant'
import { groupTestUrls, independentLatencyTest, speedtestUrl } from '@/store/settings'
import { activeBackend } from '@/store/setup'
import type { Proxy, ProxyProvider } from '@/types'
import { last } from 'lodash'
import {
  computed,
  effectScope,
  ref,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
} from 'vue'
import { IPv6Cache, ipv6Identities, type IPv6Probe } from './ipv6-cache'

export const proxyGroupList = ref<string[]>([])
export const proxyMap = ref<Record<string, Proxy>>({})
export const IPv6Map = ref<Record<string, boolean>>({})
export const proxyProviederList = ref<ProxyProvider[]>([])
export const ipv6Cache = new IPv6Cache()

// Include the endpoint and credentials: editing a saved backend keeps its UUID.
watch(
  () => {
    const b = activeBackend.value
    return JSON.stringify(
      b && [b.uuid, b.type, b.protocol, b.host, b.port, b.secondaryPath, b.username, b.password],
    )
  },
  (backend) => {
    ipv6Cache.switchBackend(backend ?? '')
    IPv6Map.value = {}
    proxyMap.value = {}
    proxyProviederList.value = []
    proxyGroupList.value = []
  },
  { immediate: true, flush: 'sync' },
)

export const reconcileIPv6 = () => {
  ipv6Cache.reconcile(ipv6Identities(proxyMap.value, proxyProviederList.value))
  IPv6Map.value = ipv6Cache.snapshot()
}

export const finishIPv6Probe = (ticket: IPv6Probe | undefined, supported: boolean) => {
  ipv6Cache.finish(ticket, supported)
  IPv6Map.value = ipv6Cache.snapshot()
}

export type LatencyMap = Map<string, number>

export const speedtestUrlWithDefault = computed(() => {
  return speedtestUrl.value || TEST_URL
})

export const independentLatencyEnabled = computed(
  () => can('independentLatency') && independentLatencyTest.value,
)

export const getTestUrl = (groupName?: string) => {
  if (!groupName || !independentLatencyEnabled.value) {
    return speedtestUrlWithDefault.value
  }

  const groupTestUrl = groupTestUrls.value.find((item) => item.name === groupName)

  if (groupTestUrl) {
    return groupTestUrl.url
  }

  const proxyNode =
    proxyMap.value[groupName] || proxyProviederList.value.find((p) => p.name === groupName)

  return proxyNode?.testUrl || speedtestUrlWithDefault.value
}

export const getLatencyFromHistory = (history?: Proxy['history']) => {
  return last(history)?.delay ?? NOT_CONNECTED
}

const DEFAULT_TEST_URL_BUCKET = ''

const latencyMapCache = new Map<string, ComputedRef<LatencyMap>>()

const readHistory = (proxyName: string, testUrl: string) => {
  const proxyNode = proxyMap.value[proxyName]

  if (testUrl !== DEFAULT_TEST_URL_BUCKET) {
    if (!proxyNode) {
      return undefined
    }

    if (proxyNode.extra) {
      return proxyNode.extra[testUrl]?.history
    }
  }

  return proxyMap.value[getNowProxyNodeName(proxyName)]?.history
}

const latencyScope = effectScope(true)

const getLatencyMap = (testUrl: string) => {
  let latencyMap = latencyMapCache.get(testUrl)

  if (!latencyMap) {
    latencyMap = latencyScope.run(() =>
      computed(() => {
        const result: LatencyMap = new Map()

        for (const name of Object.keys(proxyMap.value)) {
          result.set(name, getLatencyFromHistory(readHistory(name, testUrl)))
        }

        return result
      }),
    )!
    latencyMapCache.set(testUrl, latencyMap)
  }

  return latencyMap
}

const getTestUrlBucket = (groupName?: string) => {
  if (groupName && independentLatencyEnabled.value) {
    return getTestUrl(groupName)
  }

  return DEFAULT_TEST_URL_BUCKET
}

export const latencyMapOf = (groupName?: MaybeRefOrGetter<string | undefined>) =>
  computed(() => getLatencyMap(getTestUrlBucket(toValue(groupName))).value)

export const getLatencyByName = (proxyName: string, groupName?: string) => {
  return getLatencyMap(getTestUrlBucket(groupName)).value.get(proxyName) ?? NOT_CONNECTED
}

export const getHistoryByName = (proxyName: string, groupName?: string) => {
  if (groupName && independentLatencyEnabled.value) {
    const proxyNode = proxyMap.value[proxyName]
    const url = getTestUrl(groupName)

    if (!proxyNode) {
      return []
    }

    if (!proxyNode?.extra) {
      const nowNode = proxyMap.value[getNowProxyNodeName(proxyName)]

      return nowNode?.history
    }

    if (!proxyNode.extra?.[url]) {
      proxyNode.extra[url] = {
        history: [],
        alive: true,
      }
    }

    return proxyNode?.extra?.[url]?.history
  }

  const nowNode = proxyMap.value[getNowProxyNodeName(proxyName)]

  return nowNode?.history
}

export const getIPv6ByName = (proxyName: string) => {
  return IPv6Map.value[getNowProxyNodeName(proxyName)]
}

export const getNowProxyNodeName = (name: string) => {
  let node = proxyMap.value[name]

  if (!name || !node) {
    return name
  }

  while (node.now && node.now !== node.name) {
    const nextNode = proxyMap.value[node.now]

    if (!nextNode) {
      return node.name
    }

    node = nextNode
  }

  return node.name
}

export const getProxyGroupChains = (name: string) => {
  let proxyNode = proxyMap.value[name]

  if (!proxyNode) {
    return []
  }

  const result = [name]

  while (
    proxyNode.now &&
    proxyNode.now !== proxyNode.name &&
    proxyGroupList.value.includes(proxyNode.now)
  ) {
    result.push(proxyNode.now)
    proxyNode = proxyMap.value[proxyNode.now]
  }
  return result
}

export const hasSmartGroup = computed(() => {
  return Object.values(proxyMap.value).some(
    (proxy) => proxy.type.toLowerCase() === PROXY_TYPE.Smart,
  )
})

const untestableProxyTypes = new Set([PROXY_TYPE.Reject, PROXY_TYPE.RejectDrop, PROXY_TYPE.Block])

export const isLatencyTestable = (name: string) => {
  const type = proxyMap.value[name]?.type.toLowerCase() as PROXY_TYPE | undefined

  return !type || !untestableProxyTypes.has(type)
}

export const getProviderNameByProxy = (proxyName: string) => {
  const hinted = proxyMap.value[proxyName]?.['provider-name']

  if (hinted) {
    return proxyProviederList.value.some((provider) => provider.name === hinted) ? hinted : ''
  }

  return (
    proxyProviederList.value.find((provider) =>
      provider.proxies.some((proxy) => proxy.name === proxyName),
    )?.name ?? ''
  )
}

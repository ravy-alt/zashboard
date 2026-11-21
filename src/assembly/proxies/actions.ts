import { activeConnections, connectionAccessor, disconnectById } from '@/assembly/connections'
import { driver } from '@/assembly/driver'
import { GLOBAL, PROXY_TYPE } from '@/constant'
import { notifyRequestError } from '@/helper/request-error'
import { automaticDisconnection, iconReflectList } from '@/store/settings'

import type { Proxy } from '@/types'
import { initSmartWeights } from './smart'
import { ipv6Cache, proxyGroupList, proxyMap, proxyProviederList, reconcileIPv6 } from './state'

let fetchSequence = 0
let latestFetch = Promise.resolve()

export const fetchProxies = async () => {
  let pending = fetchProxySnapshot()
  latestFetch = pending
  // A probe must validate against an applied snapshot, not an older request
  // discarded because another refresh is still in flight.
  for (;;) {
    await pending
    if (pending === latestFetch) return
    pending = latestFetch
  }
}

const fetchProxySnapshot = async () => {
  const sequence = ++fetchSequence
  const session = ipv6Cache.session

  const { proxies, providers } = await driver().proxies.fetch()

  if (fetchSequence !== sequence || ipv6Cache.session !== session) {
    return
  }

  const sortIndex = proxies[GLOBAL]?.all ?? []
  const allProviderProxies: Record<string, Proxy> = {}

  for (const provider of providers) {
    for (const proxy of provider.proxies) {
      proxy['provider-name'] ||= provider.name
      allProviderProxies[proxy.name] = proxy
    }
  }

  // Some Clash backends only attach provider metadata in /providers/proxies.
  // Keep that identity when /proxies supplies the same node's current state.
  for (const [name, proxy] of Object.entries(proxies)) {
    proxy['provider-name'] ||= allProviderProxies[name]?.['provider-name']
  }

  proxyMap.value = {
    ...allProviderProxies,
    ...proxies,
  }
  proxyGroupList.value = Object.values(proxies)
    .filter((proxy) => proxy.all?.length && proxy.name !== GLOBAL)
    .sort((prev, next) => {
      const prevIndex = sortIndex.indexOf(prev.name)
      const nextIndex = sortIndex.indexOf(next.name)

      if (prevIndex === -1 && nextIndex === -1) {
        return 0
      }
      if (prevIndex === -1) {
        return 1
      }
      if (nextIndex === -1) {
        return -1
      }
      return prevIndex - nextIndex
    })
    .map((proxy) => proxy.name)

  proxyProviederList.value = providers
  reconcileIPv6()

  let includesSmartGroup = false

  Object.entries(proxyMap.value).forEach(([name, proxy]) => {
    const iconReflect = iconReflectList.value.find((icon) => icon.name === name)

    if (iconReflect) {
      proxyMap.value[name].icon = iconReflect.icon
    }

    if (proxy.type.toLowerCase() === PROXY_TYPE.Smart) {
      includesSmartGroup = true
    }
  })

  if (includesSmartGroup) {
    initSmartWeights()
  }
}

export const handlerProxySelect = async (proxyGroupName: string, proxyName: string) => {
  try {
    const proxyGroup = proxyMap.value[proxyGroupName]

    if (proxyGroup.type.toLowerCase() === PROXY_TYPE.LoadBalance) return
    if (proxyGroup.now === proxyName) {
      await fetchProxies()
      if (proxyGroup.now === proxyName) return
    }

    await driver().proxies.select(proxyGroupName, proxyName)
    proxyMap.value[proxyGroupName].now = proxyName

    if (automaticDisconnection.value) {
      activeConnections.value
        .filter((c) => connectionAccessor().chains(c).includes(proxyGroupName))
        .forEach((c) => disconnectById(c.id).catch(() => {}))
    }
    fetchProxies()
  } catch (e) {
    notifyRequestError(e)
  }
}

export const updateProxyProvider = (name: string) => driver().proxies.updateProvider(name)

export const proxyProviderHealthCheck = (name: string) => driver().proxies.healthCheckProvider(name)

export const fetchSmartWeights = () => driver().proxies.fetchSmartWeights()

export const flushSmartGroupWeights = () => driver().proxies.flushSmartWeights()

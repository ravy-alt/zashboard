import { can } from '@/assembly/backend'
import { driver } from '@/assembly/driver'
import { IPV6_TEST_URL, NOT_CONNECTED, PROXY_TYPE, SPEEDTEST_MODE } from '@/constant'
import { isProxyGroup } from '@/helper'
import { showNotification } from '@/helper/notification'
import { notifyRequestError } from '@/helper/request-error'
import { i18n } from '@/i18n'
import { IPv6test, speedtestMode, speedtestTimeout } from '@/store/settings'
import pLimit from 'p-limit'
import { fetchProxies } from './actions'
import {
  finishIPv6Probe,
  getHistoryByName,
  getLatencyByName,
  getNowProxyNodeName,
  getProviderNameByProxy,
  getTestUrl,
  independentLatencyEnabled,
  ipv6Cache,
  isLatencyTestable,
  proxyGroupList,
  proxyMap,
  speedtestUrlWithDefault,
} from './state'

const testNodeLatency = (proxyName: string, url: string, timeout: number) => {
  const providerName = getProviderNameByProxy(proxyName)

  if (providerName) {
    return driver().proxies.testProviderNode(providerName, proxyName, url, timeout)
  }

  return driver().proxies.testNode(proxyName, url, timeout)
}

const latencyTestForSingle = async (proxyName: string, url: string, timeout: number) => {
  const now = getNowProxyNodeName(proxyName)
  const session = ipv6Cache.session

  if (IPv6test.value) {
    const ticket = ipv6Cache.begin(now)
    try {
      const delay = await testNodeLatency(now, IPV6_TEST_URL, 2000)
      await fetchProxies()
      finishIPv6Probe(ticket, delay > NOT_CONNECTED)
    } catch {
      finishIPv6Probe(ticket, false)
    }
  }

  if (session !== ipv6Cache.session) throw new Error('Backend changed during latency test')

  return await testNodeLatency(independentLatencyEnabled.value ? proxyName : now, url, timeout)
}

const getNameForNotification = (name: string, url: string) => {
  if (independentLatencyEnabled.value) {
    return `${name}\n@${url}`
  }

  return name
}

export const proxyLatencyTest = async (
  proxyName: string,
  url = speedtestUrlWithDefault.value,
  timeout = speedtestTimeout.value,
) => {
  if (!can('latencyTest')) return

  try {
    await latencyTestForSingle(proxyName, url, timeout)
  } catch {
    showNotification({
      content: 'testFailedTip',
      params: {
        name: getNameForNotification(proxyName, url),
      },
      type: 'alert-error',
    })
  } finally {
    await fetchProxies()
  }
}

const setHistory = (proxyName: string, delay: number, groupName?: string) => {
  const history = getHistoryByName(proxyName, groupName)

  history.push({
    time: new Date().toISOString(),
    delay,
  })
}

const TIP_KEY = 'testLatencyOneByOneWithTip'
const limiter = pLimit(5)

const testLatencyOneByOneWithTip = async (
  tipName: string,
  nodes: string[],
  url = speedtestUrlWithDefault.value,
  groupName?: string,
) => {
  const session = ipv6Cache.session
  const total = nodes.length
  let testDone = 0
  let testFailed = 0

  await Promise.allSettled(
    nodes.map((name) =>
      limiter(async () => {
        if (session !== ipv6Cache.session) return
        try {
          const delay = await latencyTestForSingle(
            name,
            url,
            Math.min(2000, speedtestTimeout.value),
          )

          if (session === ipv6Cache.session) setHistory(name, delay, groupName)
        } catch {
          testFailed++
          if (session === ipv6Cache.session) setHistory(name, NOT_CONNECTED, groupName)
        } finally {
          testDone++
          if (session === ipv6Cache.session)
            showNotification({
              content: 'testFinishedTip',
              key: TIP_KEY + tipName,
              params: {
                name: getNameForNotification(tipName, url),
                total: total.toString(),
                number: testDone.toString(),
              },
              type: 'alert-info',
              timeout: 0,
            })
        }
      }),
    ),
  )

  if (session !== ipv6Cache.session) return

  await fetchProxies().catch(() => {})

  showNotification({
    content: 'testFinishedResultTip',
    key: TIP_KEY + tipName,
    params: {
      name: getNameForNotification(tipName, url),
      total: total.toString(),
      success: `${total - testFailed}`,
      failed: `${testFailed}`,
    },
    type: testFailed ? 'alert-warning' : 'alert-success',
    timeout: 3000,
  })
}

export const proxyGroupLatencyTest = async (proxyGroupName: string) => {
  if (!can('latencyTest')) return

  const proxyNode = proxyMap.value[proxyGroupName]
  const session = ipv6Cache.session
  const all = (proxyNode.all ?? []).filter(isLatencyTestable)
  const url = getTestUrl(proxyGroupName)

  if (
    speedtestMode.value === SPEEDTEST_MODE.DASHBOARD &&
    can('nodeLatencyTest') &&
    [PROXY_TYPE.Selector, PROXY_TYPE.LoadBalance, PROXY_TYPE.Smart].includes(
      proxyNode.type.toLowerCase() as PROXY_TYPE,
    )
  ) {
    if (proxyNode.fixed) {
      driver()
        .proxies.clearFixed(proxyGroupName)
        .catch(() => {})
    }
    return testLatencyOneByOneWithTip(proxyGroupName, all, url, proxyGroupName)
  }

  const timeout = Math.max(5000, speedtestTimeout.value)

  if (IPv6test.value) {
    const tickets = all.map((name) => [name, ipv6Cache.begin(getNowProxyNodeName(name))] as const)
    try {
      const ipv6LatencyResult = await driver().proxies.testGroup(
        proxyGroupName,
        IPV6_TEST_URL,
        timeout,
      )

      await fetchProxies()
      tickets.forEach(([name, ticket]) => {
        if (ticket?.name === getNowProxyNodeName(name)) {
          finishIPv6Probe(ticket, ipv6LatencyResult[name] > NOT_CONNECTED)
        }
      })
    } catch {
      tickets.forEach(([, ticket]) => {
        finishIPv6Probe(ticket, false)
      })
    }
  }
  if (session !== ipv6Cache.session) return
  try {
    await driver().proxies.testGroup(proxyGroupName, url, timeout)
  } catch (e) {
    notifyRequestError(e)
    return
  } finally {
    await fetchProxies()
  }

  const total = all.length
  const testFailed = all.filter(
    (name) => getLatencyByName(name, proxyGroupName) === NOT_CONNECTED,
  ).length

  showNotification({
    content: 'testFinishedResultTip',
    key: TIP_KEY + proxyGroupName,
    params: {
      name: getNameForNotification(proxyGroupName, url),
      total: total.toString(),
      success: `${total - testFailed}`,
      failed: `${testFailed}`,
    },
    type: testFailed ? 'alert-warning' : 'alert-success',
    timeout: 3000,
  })
}

export const allProxiesLatencyTest = async () => {
  if (!can('latencyTest')) return

  if (independentLatencyEnabled.value || !can('nodeLatencyTest')) {
    const limit = pLimit(3)

    return await Promise.all(
      proxyGroupList.value.map((proxyGroupName) =>
        limit(async () => {
          await proxyGroupLatencyTest(proxyGroupName)
        }),
      ),
    )
  }

  const proxyNode = Object.keys(proxyMap.value).filter(
    (proxy) => !isProxyGroup(proxy) && isLatencyTestable(proxy),
  )

  return testLatencyOneByOneWithTip(i18n.global.t('all'), proxyNode)
}

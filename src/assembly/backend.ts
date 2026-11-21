import { displayAllFeatures } from '@/store/settings'
import { activeBackend } from '@/store/setup'
import { computed, ref } from 'vue'
import { daeCapabilities } from './capabilities'

export enum Core {
  Mihomo = 'mihomo',
  Honk = 'honk',
  SingBox = 'sing-box',
  Dae = 'dae',
  Unknown = 'unknown',
}

export const core = ref<Core>(Core.Unknown)

export const resetCore = () => {
  core.value = Core.Unknown
}

const isNonMihomoCore = computed(
  () => core.value === Core.Honk && activeBackend.value?.type !== 'dae',
)

const isForkCoreOverride = computed(() => isNonMihomoCore.value && displayAllFeatures.value)

export const showDisplayAllFeatures = computed(() => !!activeBackend.value && isNonMihomoCore.value)

export type Cap =
  | 'coreUpgrade'
  | 'coreRestart'
  | 'dashboardUpgrade'
  | 'reloadConfigs'
  | 'updateConfigs'
  | 'updateGeoDatabase'
  | 'syncSettings'
  | 'independentLatency'
  | 'coreUpdateCheck'
  | 'configPatch'
  | 'modeSwitch'
  | 'traceLogLevel'
  | 'silentLogLevel'
  | 'runtimeStats'
  | 'latencyTest'
  | 'proxyProviderUpdate'
  | 'proxyProviderHealthCheck'
  | 'ruleProviders'
  | 'flushDNSCache'
  | 'flushFakeIP'
  | 'dnsQuery'
  | 'connectionsClose'
  | 'connectionsFilterClose'
  | 'customTestUrl'
  | 'nodeLatencyTest'
  | 'metricsHistory'
  | 'backendEvents'
  | 'flows'
  | 'dnsCache'
  | 'dnsLog'
  | 'dnsRules'
  | 'routingTrace'
  | 'datapath'
  | 'runtimeSettings'
  | 'geodataSettings'
  | 'configSources'
  | 'configCreate'
  | 'configEdit'
  | 'entryManage'
  | 'groupConfigPatch'
  | 'lifecycleControl'

type Caps = Partial<Record<Cap, boolean>>

const clashCaps = computed<Caps>(() => {
  // sing-box exposes a subset of Clash API. In particular, /configs accepts
  // unsupported fields without applying them, so a successful request is not
  // evidence that the operation is supported.
  if (core.value === Core.SingBox) {
    return {
      dashboardUpgrade: true,
      modeSwitch: true,
      latencyTest: true,
      proxyProviderUpdate: true,
      proxyProviderHealthCheck: true,
      flushDNSCache: true,
      flushFakeIP: true,
      dnsQuery: true,
      connectionsClose: true,
      customTestUrl: true,
      nodeLatencyTest: true,
      traceLogLevel: true,
    }
  }

  const mihomo = core.value === Core.Mihomo
  const honk = core.value === Core.Honk
  const mihomoOrForkCore = mihomo || isForkCoreOverride.value

  return {
    coreUpgrade: mihomoOrForkCore,
    coreRestart: mihomoOrForkCore,
    dashboardUpgrade: mihomoOrForkCore,
    reloadConfigs: mihomoOrForkCore,
    updateConfigs: mihomoOrForkCore,
    updateGeoDatabase: mihomoOrForkCore,
    syncSettings: mihomoOrForkCore,
    independentLatency: mihomoOrForkCore,
    coreUpdateCheck: mihomo,
    configPatch: mihomo,
    modeSwitch: mihomo,

    traceLogLevel: honk,
    silentLogLevel: mihomo,

    runtimeStats: honk,

    latencyTest: true,
    proxyProviderUpdate: true,
    proxyProviderHealthCheck: true,
    ruleProviders: true,
    flushDNSCache: true,
    flushFakeIP: true,
    dnsQuery: true,
    connectionsClose: true,
    customTestUrl: true,
    nodeLatencyTest: true,
  }
})

const daeCaps = computed<Caps>(() => {
  const resources = daeCapabilities.value?.resources
  const settingFields = resources?.runtime_settings?.fields ?? []

  return {
    reloadConfigs: resources?.reload?.available === true,
    updateGeoDatabase: resources?.geodata?.can_update === true,

    traceLogLevel: resources?.logs?.levels?.includes('trace') === true,

    runtimeStats: resources?.runtime_outbounds?.available === true,

    latencyTest: resources?.probes?.available === true,
    proxyProviderUpdate: resources?.providers?.can_refresh === true,
    flushDNSCache: resources?.dns_cache?.flush === true,
    dnsQuery: resources?.dns_query?.available === true,
    connectionsClose: resources?.connections?.can_close === true,
    connectionsFilterClose: resources?.connections?.can_close === true,
    metricsHistory:
      resources?.traffic_history?.available === true ||
      resources?.memory_history?.available === true,
    backendEvents: resources?.events?.available === true,
    flows: resources?.flows?.available === true,
    dnsCache: resources?.dns_cache?.read === true,
    dnsLog: resources?.dns_log?.available === true,
    dnsRules: resources?.dns_rules?.available === true,
    routingTrace: resources?.routing_trace?.available === true,
    datapath: resources?.datapath?.available === true,
    runtimeSettings: resources?.runtime_settings?.available === true,
    geodataSettings:
      resources?.geodata?.configurable_sources === true && settingFields.includes('geodata'),
    configSources: resources?.config?.available === true,
    configEdit: resources?.config?.writable === true,
    configCreate: resources?.config?.writable === true && resources?.config?.create === true,
    entryManage: resources?.nodes?.can_manage === true || resources?.providers?.can_manage === true,
    groupConfigPatch: resources?.groups?.config_patch === true,
    lifecycleControl:
      resources?.suspend?.available === true && resources?.resume?.available === true,
  }
})

const soft = computed<Caps>(() =>
  activeBackend.value?.type === 'dae' ? daeCaps.value : clashCaps.value,
)

export const can = (cap: Cap): boolean => {
  if (!activeBackend.value) return false

  return soft.value[cap] === true
}

export const withCapability = <T>(cap: Cap, action: () => Promise<T>): Promise<T> =>
  can(cap) ? action() : Promise.reject(new Error('Operation is not supported by this backend'))

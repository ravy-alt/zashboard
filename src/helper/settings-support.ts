import { can, core, Core, showDisplayAllFeatures, type Cap } from '@/assembly/backend'
import {
  BACKEND_ITEM_KEYS as b,
  GENERAL_ITEM_KEYS as g,
  PROXIES_ITEM_KEYS as p,
} from '@/config/settings-items'

// Use the same capability gates for rendered settings, search and customization.
// "Show all" changes a preference; it cannot add features to a backend.
const capabilities: Record<string, Cap> = {
  [b.upgradeCore]: 'coreUpgrade',
  [b.restartCore]: 'coreRestart',
  [b.reloadConfigs]: 'reloadConfigs',
  [b.updateConfigs]: 'updateConfigs',
  [b.updateGeoDatabase]: 'updateGeoDatabase',
  [b.flushDNSCache]: 'flushDNSCache',
  [b.flushFakeIP]: 'flushFakeIP',
  [b.ports]: 'configPatch',
  [b.tunMode]: 'configPatch',
  [b.tunStack]: 'configPatch',
  [b.allowLan]: 'configPatch',
  [b.checkCoreUpgrade]: 'coreUpdateCheck',
  [b.autoUpgradeCore]: 'coreUpdateCheck',
  [b.daeConfigSources]: 'configSources',
  [p.independentLatencyTest]: 'independentLatency',
  [p.groupTestUrls]: 'independentLatency',
  [g.autoUpgradeDashboard]: 'dashboardUpgrade',
  [`${g.actions}.upgradeDashboard`]: 'dashboardUpgrade',
}

export const isSettingSupported = (key: string): boolean => {
  if (key === g.displayAllFeatures) return showDisplayAllFeatures.value
  if (key === b.flushSmartWeights) return core.value !== Core.SingBox && core.value !== Core.Dae
  if (key === b.daeRuntime)
    return can('runtimeSettings') || can('lifecycleControl') || can('datapath')
  if (key === b.daeGeoData) return core.value === Core.Dae
  if (key === b.DNSQuery)
    return can('dnsQuery') || can('dnsCache') || can('dnsLog') || can('dnsRules')
  const capability = capabilities[key]
  return !capability || can(capability)
}

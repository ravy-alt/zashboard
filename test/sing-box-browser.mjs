// Exercise real capability detection, request guards and rendered backend settings.
// Stub HTTP at the adapter boundary; never mutate a running user's backend.
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { connectBrowser, waitFor } from './lib/cdp.mjs'
import { launchChrome } from './lib/chrome.mjs'
import { findFreePort } from './lib/ports.mjs'

const vite = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
await vite.listen()
let chrome, browser
try {
  const port = await findFreePort()
  chrome = await launchChrome({ port, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  browser = await connectBrowser(port)
  const page = await browser.newPage({})
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  await page.goto(origin + '/test/browser.html')
  assert.notEqual(
    await waitFor(
      async () =>
        (await page.evaluate('location.origin')) === origin &&
        (await page.evaluate('typeof __APP_VERSION__ !== \"undefined\"')),
    ),
    null,
  )
  const results = await page.evaluate(`(async () => {
    const endpoint = (uuid, type = 'clash') => ({ uuid, type, protocol:'http', host:'127.0.0.1', port:'1', secondaryPath:'', password:'' })
    localStorage.setItem('setup/api-list', JSON.stringify([
      {...endpoint('legacy', 'singbox'), singboxChannel:'stable'}, endpoint('dae', 'dae'), endpoint('normal'),
    ]))
    localStorage.setItem('setup/active-uuid', 'legacy')
    const setup = await import('/src/store/setup.ts')
    const settings = await import('/src/store/settings.ts')
    const backend = await import('/src/assembly/backend.ts')
    const version = await import('/src/assembly/version.ts')
    const config = await import('/src/assembly/config.ts')
    const state = await import('/src/assembly/proxies/state.ts')
    const rules = await import('/src/assembly/rules.ts')
    const {backendActions} = await import('/src/helper/backend-actions.ts')
    const {isSettingSupported} = await import('/src/helper/settings-support.ts')
    const {BACKEND_ITEM_KEYS:b, PROXIES_ITEM_KEYS:p} = await import('/src/config/settings-items.ts')
    const {clashDriver} = await import('/src/assembly/driver/clash.ts')
    const {axios, createApp, h, nextTick, shallowRef} = await import('/test/lib/browser-deps.ts')
    const {i18n} = await import('/src/i18n/index.ts')
    const results = []
    const runtimeErrors = []
    window.addEventListener('unhandledrejection', event => runtimeErrors.push(String(event.reason)))
    window.addEventListener('error', event => runtimeErrors.push(event.message))
    const check = (name, condition) => { if (!condition) throw new Error(name); results.push(name) }
    check('legacy sing-box backend survives migration with its UUID', setup.activeUuid.value === 'legacy' && setup.backendList.value[0].type === 'clash')
    check('migration preserves dae backends', setup.backendList.value[1].type === 'dae')

    let currentVersion = 'sing-box 1.14.4-subscription.1'
    let currentMode = 'Rule'
    let calls = []
    const fetches = []
    globalThis.fetch = async input => {
      const url = String(input)
      fetches.push(url)
      if (!url.startsWith('https://api.github.com/repos/')) throw new Error('Unexpected fetch: ' + url)
      return new Response(JSON.stringify({tag_name:'vtest',assets:[]}), {status:200, headers:{'Content-Type':'application/json'}})
    }
    axios.defaults.adapter = async request => {
      calls.push({url:request.url, method:request.method, data:request.data})
      let data = {}
      if (request.url === '/version') data = {version:currentVersion, meta:true, premium:true}
      else if (request.url === '/configs' && request.method === 'get') data = {...config.defaultConfig, mode:currentMode, 'mode-list':['Rule','Global','Direct']}
      else if (request.url === '/configs' && request.method === 'patch') currentMode = JSON.parse(request.data).mode ?? currentMode
      else if (request.url === '/rules') data = {rules:null}
      else if (request.url === '/providers/rules' || request.url === '/providers/proxies') data = {providers:{}}
      else if (request.url === '/proxies') data = {proxies:{}}
      else if (request.url?.includes('/releases/latest')) data = {tag_name:'vtest', assets:[]}
      return {data, status:200, statusText:'OK', headers:{}, config:request}
    }
    settings.checkUpgradeCore.value = true
    settings.autoUpgradeCore.value = true
    settings.displayAllFeatures.value = true
    settings.independentLatencyTest.value = true
    settings.hiddenSettingsItems.value = {}
    await version.probeActiveBackend()
    check('sing-box is detected despite Mihomo compatibility flags', backend.core.value === backend.Core.SingBox)
    check('sing-box uses its own brand', version.coreBrand.value.url.includes('SagerNet/sing-box'))
    check('Mihomo update checks and auto-upgrades are not requested', calls.length === 1 && calls[0].url === '/version' && fetches.length === 0)
    const unsupported = ['coreUpgrade','coreRestart','reloadConfigs','updateConfigs','updateGeoDatabase','configPatch','coreUpdateCheck','syncSettings','ruleProviders','independentLatency','runtimeStats']
    for (const name of unsupported) check('sing-box does not advertise ' + name, !backend.can(name))
    for (const name of ['modeSwitch','dashboardUpgrade','proxyProviderUpdate','proxyProviderHealthCheck','latencyTest','nodeLatencyTest','dnsQuery','flushDNSCache','flushFakeIP','connectionsClose']) check('sing-box keeps ' + name, backend.can(name))
    check('saved independent-latency preference cannot enable unsupported histories', !state.independentLatencyEnabled.value)
    check('search and customization exclude unsupported settings', !isSettingSupported(b.ports) && !isSettingSupported(b.reloadConfigs) && !isSettingSupported(p.independentLatencyTest))
    check('backend action menu contains only supported maintenance actions', backendActions.value.map(a=>a.label).join(',') === 'flushDNSCache,flushFakeIP')
    setup.activeUuid.value = 'dae'
    backend.core.value = backend.Core.Dae
    check('dae capabilities remain isolated', !backend.can('modeSwitch') && !backend.can('configPatch'))
    setup.activeUuid.value = 'legacy'
    await version.probeActiveBackend()
    const stream = () => ({data:shallowRef(), close(){}})
    clashDriver.metrics.traffic = stream
    clashDriver.metrics.memory = stream
    clashDriver.connections.subscribe = stream
    clashDriver.logs.subscribe = () => ({close(){}})
    clashDriver.system.probe = async () => ({ok:true, latency:1})
    const {default:BackendSettings} = await import('/src/components/settings/backend/BackendSettings.vue')
    await version.coreReady()
    await config.fetchConfigs()
    await new Promise(resolve => setTimeout(resolve, 50))
    const app = createApp({render:() => h(BackendSettings)}).use(i18n)
    app.config.warnHandler = message => runtimeErrors.push('Vue warning: ' + message)
    app.config.errorHandler = (error, instance, info) => runtimeErrors.push((instance?.$options?.__file ?? '') + ' ' + info + ': ' + error)
    app.mount('#app')
    await nextTick()
    const hasSetting = key => !!document.querySelector('[data-setting-key="'+key+'"]')
    for (const key of [b.upgradeCore,b.restartCore,b.reloadConfigs,b.updateConfigs,b.updateGeoDatabase,b.ports,b.tunMode,b.allowLan,b.checkCoreUpgrade,b.autoUpgradeCore]) check('unsupported control is absent: ' + key, !hasSetting(key))
    check('DNS controls are rendered', hasSetting(b.flushDNSCache) && hasSetting(b.flushFakeIP) && hasSetting(b.DNSQuery))
    await config.updateConfigs({mode:'Global'})
    check('mode change still reaches PATCH /configs and refreshes mode', config.configs.value.mode === 'Global')
    for (const action of [() => config.updateConfigs({port:1234}), () => config.updateConfigs({mode:'Rule',port:1234}), config.reloadConfigs, () => config.loadConfigs({payload:'{}'}), config.updateGeoData, version.restartCore, () => version.upgradeCore('auto')]) {
      const before = calls.length
      let rejected = false
      try { await action() } catch { rejected = true }
      check('unsupported operation is rejected before any HTTP request', rejected && calls.length === before)
    }
    calls = []
    await rules.fetchRules()
    check('empty sing-box rules are valid and rule providers are not queried', rules.rules.value.length === 0 && calls.every(c=>c.url === '/rules'))
    await version.upgradeUI()
    check('dashboard upgrade remains supported', calls.at(-1).url === '/upgrade/ui')
    settings.autoUpgradeDashboard.value = false
    await version.checkUIUpdate()
    check('dashboard update check targets the fork', fetches.includes('https://api.github.com/repos/ravy-alt/zashboard/releases/latest') && !fetches.some(url => url.includes('Zephyruso') || url.includes('MetaCubeX')))

    settings.checkUpgradeCore.value = false
    currentVersion = 'v1.19.0'
    await version.probeActiveBackend()
    await nextTick()
    check('switching to Mihomo restores its capabilities and controls', backend.can('coreUpgrade') && backend.can('configPatch') && hasSetting(b.ports) && hasSetting(b.reloadConfigs))
    check('Mihomo retains independent latency preference', state.independentLatencyEnabled.value)
    currentVersion = 'honk 1.0'
    await version.probeActiveBackend()
    check('Honk display-all override remains available', backend.showDisplayAllFeatures.value && backend.can('coreUpgrade'))
    currentVersion = 'sing-box 1.14.4'
    await version.probeActiveBackend()
    await nextTick()
    check('returning to sing-box hides controls even with display-all enabled', !backend.showDisplayAllFeatures.value && !hasSetting(b.ports) && !backend.can('coreUpgrade'))
    app.unmount()
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 50))
    if (runtimeErrors.length) throw new Error(runtimeErrors.join('; '))
    check('backend transitions render without runtime errors', runtimeErrors.length === 0)
    return results
  })()`)
  for (const name of results) console.log(`PASS ${name}`)
} finally {
  browser?.close()
  await chrome?.close()
  await vite.close()
}

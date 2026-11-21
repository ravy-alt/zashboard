// Exercise the actual Vue store, fetch/probe actions and rendered node card.
// Only the driver I/O is stubbed. The browser profile and Vite server are isolated.
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { connectBrowser, waitFor } from './lib/cdp.mjs'
import { launchChrome } from './lib/chrome.mjs'
import { findFreePort } from './lib/ports.mjs'

const vite = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
vite.middlewares.use('/_ipv6-test', (_req, res) => {
  res.setHeader('Content-Type', 'text/html')
  res.end('<html><body><div id="app"></div></body></html>')
})
await vite.listen()
let chrome, browser
try {
  const port = await findFreePort()
  chrome = await launchChrome({ port, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  browser = await connectBrowser(port)
  const page = await browser.newPage({})
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  await page.goto(origin + '/_ipv6-test')
  assert.notEqual(
    await waitFor(async () => (await page.evaluate('location.origin')) === origin),
    null,
  )
  const results = await page.evaluate(`(async () => {
    localStorage.setItem('cache/ipv6-map', JSON.stringify({node: true}))
    const state = await import('/src/assembly/proxies/state.ts')
    const actions = await import('/src/assembly/proxies/actions.ts')
    const latency = await import('/src/assembly/proxies/latency.ts')
    const setup = await import('/src/store/setup.ts')
    const settings = await import('/src/store/settings.ts')
    const {clashDriver} = await import('/src/assembly/driver/clash.ts')
    const {defaultConfig} = await import('/src/assembly/config.ts')
    clashDriver.config.fetch = async () => structuredClone(defaultConfig)
    clashDriver.rules.fetch = async () => ({rules:[],providers:[]})
    const {IPV6_TEST_URL} = await import('/src/constant/index.ts')
    const {createApp, h, nextTick} = await import('/node_modules/.vite/deps/vue.js')
    const {i18n} = await import('/src/i18n/index.ts')
    const {default: Card} = await import('/src/components/proxies/ProxyNodeCard.vue')
    const results = []
    const check = (name, condition) => {
      if (!condition) throw new Error(name)
      results.push(name)
    }
    const backend = (uuid, port = '1') => ({ uuid, type:'clash', protocol:'http', host:'127.0.0.1', port, secondaryPath:'', password:'' })
    setup.backendList.value = [backend('a'), backend('b')]
    setup.activeUuid.value = 'a'
    settings.IPv6test.value = true
    let revision = 1, present = true
    const payload = () => {
      const node = {name:'node', type:'Shadowsocks', history:[], now:'', icon:'', 'provider-name':'source', 'x-sing-box-revision':'runtime:'+revision, extra:{[IPV6_TEST_URL]:{history:[{time:new Date().toISOString(),delay:10}],alive:true}}}
      const group = {name:'auto', type:'URLTest', history:[], now:present?'node':'', all:present?['node']:[], icon:''}
      return {proxies: present?{node,auto:group}:{auto:group}, providers:[{name:'source', vehicleType:'HTTP', updatedAt:String(revision),proxies:present?[node]:[]}]}
    }
    clashDriver.proxies.fetch = async () => payload()
    clashDriver.proxies.testProviderNode = async () => 10
    clashDriver.proxies.testNode = async () => 10
    clashDriver.proxies.testGroup = async () => ({node:10})
    await actions.fetchProxies()
    createApp({render:() => state.proxyMap.value.node ? h(Card,{name:'node'}) : h('span','empty')}).use(i18n).mount('#app')
    await nextTick()
    const badge = () => document.querySelector('#app').textContent.includes('IPv6')
    check('legacy storage and unversioned extra history do not restore the badge', !badge())
    await latency.proxyLatencyTest('node')
    await nextTick()
    check('a successful current probe renders an IPv6 badge', badge())
    revision++
    await actions.fetchProxies(); await nextTick()
    check('same-name runtime replacement removes the rendered badge', !badge())
    await latency.proxyGroupLatencyTest('auto'); await nextTick()
    check('successful group probe restores only current members', badge())
    present = false; revision++
    await actions.fetchProxies(); await nextTick()
    check('deleted node is removed', !state.proxyMap.value.node && !state.IPv6Map.value.node)
    present = true; revision++
    await actions.fetchProxies(); await nextTick()
    check('reintroduced name has no inherited badge', !badge())

    let release
    clashDriver.proxies.testGroup = async () => new Promise(resolve => {release=resolve})
    const inFlightGroup = latency.proxyGroupLatencyTest('auto')
    revision++
    await actions.fetchProxies()
    // Let the ordinary second probe finish immediately.
    clashDriver.proxies.testGroup = async () => ({node:10})
    release({node:10})
    await inFlightGroup; await nextTick()
    check('late group response cannot mark a replaced member', !badge())

    let releaseFirst, releaseSecond, fetchCalls = 0
    const stalePayload = payload()
    clashDriver.proxies.fetch = async () => new Promise(resolve => {
      if (++fetchCalls === 1) releaseFirst = resolve
      else releaseSecond = resolve
    })
    const overlappingProbe = latency.proxyLatencyTest('node')
    for (let i=0; i<10 && !releaseFirst; i++) await Promise.resolve()
    check('probe starts post-measurement identity validation', !!releaseFirst)
    const newerFetch = actions.fetchProxies()
    releaseFirst(stalePayload)
    for (let i=0; i<10; i++) await Promise.resolve()
    check('discarded snapshot cannot validate an IPv6 result while a newer fetch is pending', !state.IPv6Map.value.node)
    revision++
    clashDriver.proxies.fetch = async () => payload()
    releaseSecond(payload())
    await Promise.all([overlappingProbe, newerFetch]); await nextTick()
    check('overlapping refresh applies the new identity before a probe can commit', !badge())

    clashDriver.proxies.fetch = async () => {
      const value = payload()
      value.providers[0].proxies = [{...value.proxies.node}]
      delete value.proxies.node['provider-name']
      return value
    }
    await actions.fetchProxies()
    check('provider identity survives a global proxy entry without provider-name', state.proxyMap.value.node['provider-name']==='source')
    clashDriver.proxies.fetch = async () => payload()

    clashDriver.proxies.testProviderNode = async () => new Promise(resolve => {release=resolve})
    const inFlight = latency.proxyLatencyTest('node')
    setup.activeUuid.value = 'b'
    check('switch clears nodes and badges synchronously', !Object.keys(state.proxyMap.value).length && !Object.keys(state.IPv6Map.value).length)
    await actions.fetchProxies()
    clashDriver.proxies.testProviderNode = async () => 10
    release(10)
    await inFlight; await nextTick()
    check('late A probe cannot mark B same-name node', !badge())
    await latency.proxyLatencyTest('node'); await nextTick()
    check('B can be independently tested', badge())
    setup.updateBackend('b', {...backend('b'), port:'2'})
    await actions.fetchProxies(); await nextTick()
    check('editing the endpoint under the same UUID invalidates the badge', !badge())

    let releaseFetch
    clashDriver.proxies.fetch = async () => new Promise(resolve => {releaseFetch=resolve})
    const oldPayload = payload()
    oldPayload.proxies.node['x-sing-box-revision']='obsolete'
    const oldFetch = actions.fetchProxies()
    setup.activeUuid.value = 'a'
    clashDriver.proxies.fetch = async () => payload()
    await actions.fetchProxies()
    releaseFetch(oldPayload)
    await oldFetch
    check('old backend list response cannot replace current nodes', state.proxyMap.value.node['x-sing-box-revision']!=='obsolete')
    return results
  })()`)
  for (const name of results) console.log(`PASS ${name}`)
} finally {
  browser?.close()
  await chrome?.close()
  await vite.close()
}

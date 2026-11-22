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
    const setup = await import('/src/store/setup.ts')
    const settings = await import('/src/store/settings.ts')
    const backend = await import('/src/assembly/backend.ts')
    const state = await import('/src/assembly/proxies/state.ts')
    const actions = await import('/src/assembly/proxies/actions.ts')
    const latency = await import('/src/assembly/proxies/latency.ts')
    const { axios } = await import('/test/lib/browser-deps.ts')
    const { IPV6_TEST_URL, SPEEDTEST_MODE, NOT_CONNECTED } = await import('/src/constant/index.ts')
    const results = []
    const check = (name, ok) => { if (!ok) throw new Error(name); results.push(name) }
    setup.backendList.value = [{uuid:'test',type:'clash',protocol:'http',host:'127.0.0.1',port:'1',secondaryPath:'',password:''}]
    setup.activeUuid.value = 'test'
    backend.core.value = backend.Core.SingBox
    settings.speedtestUrl.value = 'https://global.example/test?q=1'
    settings.speedtestTimeout.value = 1234
    settings.IPv6test.value = false
    const bucket = delay => ({history:[{time:new Date().toISOString(),delay}],alive:true})
    const group = (name, now, all) => ({name,type:'URLTest',now,all,history:[],testUrl:'https://'+name+'.example/',extra:{},'x-sing-box-revision':'test:1'})
    const leaf = (name, offset) => ({name,type:'Shadowsocks',history:[],extra:{
      'https://A.example/':bucket(10+offset),'https://B.example/':bucket(20+offset),'https://C.example/':bucket(30+offset)
    },'x-sing-box-revision':'test:1'})
    const nodes = {A:group('A','B',['B']),B:group('B','C',['C','y']),C:group('C','x',['x']),x:leaf('x',0),y:leaf('y',1)}
    const provider = () => ({name:'source',type:'Proxy',vehicleType:'HTTP',testUrl:'https://provider.example/',proxies:[nodes.x,nodes.y]})
    const selected = name => nodes[name]?.all ? selected(nodes[name].now) : name
    let calls = [], failIPv6 = false
    axios.defaults.adapter = async request => {
      const path = request.url
      calls.push({path,params:request.params})
      let data = {}
      if (path === '/proxies') data = {proxies:structuredClone(nodes)}
      else if (path === '/providers/proxies') data = {providers:{source:structuredClone(provider())}}
      else if (path.endsWith('/delay') || path.endsWith('/healthcheck')) {
        const url = request.params.url
        if (url === IPV6_TEST_URL && failIPv6) throw new Error('IPv6 unavailable')
        const parts = path.split('/')
        if (parts[1] === 'group') {
          data = {}
          for (const name of nodes[parts[2]].all) { nodes[selected(name)].extra[url] = bucket(15); data[name]=15 }
        } else if (parts.length > 5 || parts[1] === 'proxies') {
          const name = decodeURIComponent(parts.at(-2))
          nodes[selected(name)].extra[url] = bucket(15)
          data = {delay:15}
        }
      }
      return {data,status:200,statusText:'OK',headers:{},config:request}
    }
    await actions.fetchProxies()
    check('list and provider queries carry the configured global URL', calls.filter(c=>['/proxies','/providers/proxies'].includes(c.path)).every(c=>c.params.url===settings.speedtestUrl.value) && calls.length===2)
    check('A B C display the current leaf with their own URLs', state.getLatencyByName('A')===10 && state.getLatencyByName('B')===20 && state.getLatencyByName('C')===30)
    check('B inside A is displayed using A URL', state.getLatencyByName('B','A')===10)
    nodes.B.now = 'y'
    await actions.fetchProxies()
    check('intermediate selection change immediately updates parent history', state.getLatencyByName('A')===11 && state.getLatencyByName('B')===21 && state.getLatencyByName('C')===30)
    nodes.A.testUrl='https://missing.example/'
    await actions.fetchProxies()
    check('untested URL does not borrow another URL latency', state.getLatencyByName('A')===NOT_CONNECTED)
    nodes.A.testUrl='https://A.example/'
    await actions.fetchProxies()
    calls=[]
    await latency.proxyGroupLatencyTest('A')
    check('group probe preserves root URL and short requested timeout', calls.some(c=>c.path==='/group/A/delay' && c.params.url===nodes.A.testUrl && c.params.timeout===1234))
    settings.IPv6test.value=true
    calls=[]
    await latency.proxyLatencyTest('A')
    check('single IPv6 probe pins current leaf and preserves timeout', calls.some(c=>c.path==='/providers/proxies/source/y/healthcheck' && c.params.url===IPV6_TEST_URL && c.params.timeout===1234))
    check('ordinary nested probe retains root URL', calls.some(c=>c.path==='/proxies/A/delay' && c.params.url===nodes.A.testUrl && c.params.timeout===1234))
    check('IPv6 badge belongs only to the tested leaf', state.IPv6Map.value.y===true && !state.IPv6Map.value.x && !state.IPv6Map.value.A)
    calls=[]
    await actions.proxyProviderHealthCheck('source')
    check('provider healthcheck carries provider URL and timeout', calls.some(c=>c.path==='/providers/proxies/source/healthcheck' && c.params.url==='https://provider.example/' && c.params.timeout===1234))
    nodes.B.now='C'; nodes.A.all=['B','C']
    await actions.fetchProxies()
    failIPv6=true; calls=[]
    await latency.proxyGroupLatencyTest('A')
    const ipv6calls=calls.filter(c=>c.params?.url===IPV6_TEST_URL)
    check('group IPv6 probes deduplicate final leaves and do not borrow fallback success', ipv6calls.length===1 && ipv6calls[0].path==='/providers/proxies/source/x/healthcheck' && state.IPv6Map.value.x===false)
    settings.IPv6test.value=false
    settings.speedtestMode.value=SPEEDTEST_MODE.DASHBOARD
    settings.speedtestTimeout.value=6789
    nodes.A.type='Selector'
    await actions.fetchProxies(); calls=[]
    await latency.proxyGroupLatencyTest('A')
    check('dashboard batch does not truncate the configured timeout', calls.filter(c=>c.path.endsWith('/delay')).length===2 && calls.filter(c=>c.path.endsWith('/delay')).every(c=>c.params.timeout===6789 && c.params.url===nodes.A.testUrl))

    // Click the actual card, including the standalone group case; calling the
    // latency action directly would not catch an incorrect component argument.
    const {createApp,h,nextTick} = await import('/test/lib/browser-deps.ts')
    const {i18n} = await import('/src/i18n/index.ts')
    const {default:Card} = await import('/src/components/proxies/ProxyNodeCard.vue')
    const app = createApp({render:()=>h('div',[
      h(Card,{name:'A','data-card':'standalone'}),
      h(Card,{name:'B',groupName:'A','data-card':'nested'}),
    ])}).use(i18n)
    app.mount('#app'); await nextTick()
    for (const [card,path] of [['standalone','/proxies/A/delay'],['nested','/proxies/B/delay']]) {
      calls=[]
      document.querySelector('[data-card="'+card+'"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}))
      for (let i=0;i<100 && !calls.some(c=>c.path===path);i++) await new Promise(r=>setTimeout(r,5))
      check('rendered '+card+' card tests the same URL as its displayed history',calls.some(c=>c.path===path && c.params.url===nodes.A.testUrl))
    }
    // Allow each card's post-probe refresh and animation work to finish.
    await new Promise(r=>setTimeout(r,30)); app.unmount()
    const savedExtra=nodes.x.extra
    nodes.x.history=bucket(77).history
    delete nodes.x.extra
    await actions.fetchProxies()
    check('older sing-box without URL buckets retains legacy latency display',state.getLatencyByName('C')===77)
    nodes.x.extra={}
    await actions.fetchProxies()
    check('an empty new-core URL bucket never falls back to legacy history',state.getLatencyByName('C')===NOT_CONNECTED)
    nodes.x.extra=savedExtra

    // Native labels must reach desktop/mobile group headers and nested cards
    // without opting sing-box groups into Mihomo's unrelated Smart APIs.
    nodes.A.type='URLTest'; nodes.A['x-sing-box-type']='smart-urltest'
    nodes.C['x-sing-box-type']='urltest'
    calls=[]
    await actions.fetchProxies()
    check('native smart label preserves URLTest behavior', state.proxyMap.value.A.type==='URLTest' && state.proxyGroupList.value.includes('A') && !calls.some(c=>c.path.includes('/smart')))
    const {default:Header} = await import('/src/components/proxies/ProxyGroupHeader.vue')
    const {default:MobileHeader} = await import('/src/components/proxies/ProxyGroupHeaderForMobile.vue')
    const labels = createApp({render:()=>h('div',['A','B','C'].flatMap(name=>[
      h('div',{'data-label':name+'-desktop'},[h(Header,{name,proxiesCount:'2',isLatencyTesting:false})]),
      h('div',{'data-label':name+'-mobile'},[h(MobileHeader,{name,proxiesCount:'2',isLatencyTesting:false,displayContent:false})]),
      h('div',{'data-label':name+'-card'},[h(Card,{name,groupName:'A'})]),
    ]))}).use(i18n)
    labels.mount('#app'); await nextTick()
    for (const view of ['desktop','mobile','card']) {
      const text = name=>document.querySelector('[data-label="'+name+'-'+view+'"]').textContent.toLowerCase()
      check(view+' displays native smart-urltest',text('A').includes('smart-urltest'))
      check(view+' keeps legacy and ordinary URLTest labels',text('B').includes('urltest') && !text('B').includes('smart-urltest') && text('C').includes('urltest') && !text('C').includes('smart-urltest'))
    }
    labels.unmount()
    return results
  })()`)
  for (const name of results) console.log(`PASS ${name}`)
} finally {
  browser?.close()
  await chrome?.close()
  await vite.close()
}

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
  const page = await browser.newPage({ width: 1800, height: 1000 })
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  await page.goto(origin + '/test/browser.html')
  assert.notEqual(
    await waitFor(async () => await page.evaluate('typeof __APP_VERSION__ !== "undefined"')),
    null,
  )
  const results = await page.evaluate(`(async () => {
    const endpoint = uuid => ({ uuid, type:'clash', protocol:'http', host:'127.0.0.1', port:'1', secondaryPath:'', password:'test-token' })
    localStorage.setItem('setup/api-list', JSON.stringify([endpoint('first'), endpoint('second')]))
    localStorage.setItem('setup/active-uuid', 'first')
    const setup = await import('/src/store/setup.ts')
    const settings = await import('/src/store/settings.ts')
    settings.language.value = 'en-US'
    const backend = await import('/src/assembly/backend.ts')
    const { renderRoutes } = await import('/src/helper/index.ts')
    const { axios, createApp, nextTick } = await import('/test/lib/browser-deps.ts')
    const { i18n } = await import('/src/i18n/index.ts')
    i18n.global.locale.value = 'en-US'
    const { default: Page } = await import('/src/views/DnsPage.vue')
    const checks = []
    const check = (name, condition) => { if (!condition) throw new Error(name); checks.push(name) }
    const settle = async () => { await nextTick(); await new Promise(resolve => setTimeout(resolve, 100)); await nextTick() }
    backend.core.value = backend.Core.SingBox
    backend.singBoxCapabilities.value = []
    check('old sing-box has no DNS navigation', !renderRoutes.value.includes('dns'))
    backend.singBoxCapabilities.value = ['dns-management-v1']
    check('DNS navigation is capability gated', renderRoutes.value.includes('dns'))
    const sockets = []
    globalThis.WebSocket = class {
      constructor(url) { this.url = String(url); this.closed = false; sockets.push(this) }
      close() { this.closed = true; this.onclose?.() }
    }
    const calls = []
    let deferred
    axios.defaults.adapter = async request => {
      calls.push({ url:request.url, method:request.method, params:request.params, signal:request.signal })
      let data = {}
      if (request.url === '/dns/servers') data = { servers:[
        {tag:'same',scope:'one',type:'https',address:'https://192.0.2.53:443/dns-query',dialerChain:['select','leaf'],resolver:'bootstrap',dependencies:['bootstrap'],cacheCount:1},
        {tag:'same',scope:'two',type:'udp',address:'192.0.2.54:53',dialerChain:[],dependencies:[],cacheCount:1},
      ] }
      if (request.method === 'delete' && request.params?.id === 'first') frame(sockets.at(-1), {full:false,revision:3,entries:[{...first,addresses:['192.0.2.99']}],removed:[]})
      if (request.url === '/dns/rules') data = {rules:[{index:0,match:'domain_suffix=example.com',action:'route(same)'}]}
      if (request.url === '/dns/query') {
        if (request.params.name === 'slow.example') return await new Promise(resolve => { deferred = () => resolve({data:{Status:0,Server:'old',Trace:{rule:'old'}},status:200,headers:{},config:request}) })
        data = {Status:0,Server:'same',Trace:{rule:'manual-server',purpose:'manual',cached:false},Answer:[{data:request.params.type === 'A' ? '192.0.2.1' : '2001:db8::1'}]}
      }
      return {data,status:200,statusText:'OK',headers:{},config:request}
    }
    const root = document.createElement('div')
    root.style.height = '950px'
    document.body.append(root)
    const app = createApp(Page).use(i18n)
    app.mount(root)
    await settle()
    check('one cache socket opens with authentication', sockets.length === 1 && sockets[0].url.includes('token=test-token'))
    const entry = (id, scope, domain, ip) => ({id,scope,domain,type:'A',class:1,server:'same',answers:[ip],addresses:[ip],rcode:'NOERROR',expiresAt:new Date(Date.now()+60000).toISOString(),stale:false,request:{source:'192.0.2.10',sourcePort:1234,destination:'8.8.8.8',destinationPort:53,purpose:'client',rule:'first',server:'same',lastUsed:new Date().toISOString(),hits:1}})
    const first = entry('first','one','alpha.example','192.0.2.1')
    const second = entry('second','two','beta.example','192.0.2.2')
    const frame = (socket, value) => socket.onmessage?.({data:JSON.stringify(value)})
    frame(sockets[0], {full:true,revision:1,entries:[first,second],removed:[]})
    await settle()
    const rows = () => [...root.querySelectorAll('[data-testid="dns-cache-row"]')]
    check('real cache rows display ports and rules', rows().length === 2 && rows()[0].textContent.includes('1234') && rows()[0].textContent.includes('first'))
    const search = root.querySelector('input[type="search"]')
    search.value = '192.0.2.2'; search.dispatchEvent(new Event('input')); await settle()
    check('IP search filters cache', rows().length === 1 && rows()[0].textContent.includes('beta.example'))
    search.value = ''; search.dispatchEvent(new Event('input'))
    const filter = root.querySelector('select')
    filter.value = JSON.stringify(['one','same']); filter.dispatchEvent(new Event('change')); await settle()
    check('same-name DNS servers are filtered by scope', rows().length === 1 && rows()[0].textContent.includes('alpha.example'))
    filter.value = ''; filter.dispatchEvent(new Event('change'))
    frame(sockets[0], {full:false,revision:2,entries:[{...first,request:{...first.request,sourcePort:4321,rule:'latest'}}],removed:['second']})
    await settle()
    check('delta replaces latest request and removes expired entries', rows().length === 1 && rows()[0].textContent.includes('4321') && rows()[0].textContent.includes('latest'))
    rows()[0].querySelector('button').click(); await settle()
    check('per-entry delete sends opaque ID', calls.some(c=>c.method==='delete' && c.params.id==='first') && rows().length===0)
    check('delete resynchronizes concurrent cache recreation', sockets[0].closed && sockets.length===2)
    frame(sockets.at(-1), {full:true,revision:1,entries:[{...first,addresses:['192.0.2.99']}],removed:[]});await settle()
    check('fresh snapshot restores the concurrently recreated answer', rows().length===1 && rows()[0].textContent.includes('192.0.2.99'))
    const beforePause = sockets.at(-1)
    root.querySelector('[aria-label="Pause updates"]').click(); await settle()
    check('pause releases socket', beforePause.closed)
    const pausedCount = sockets.length
    root.querySelector('[aria-label="Resume updates"]').click(); await settle()
    check('resume creates new snapshot stream', sockets.length===pausedCount+1)
    frame(sockets.at(-1), {full:true,revision:1,entries:[second],removed:[]}); await settle()
    check('reconnect replaces old cache view', rows().length===1 && rows()[0].textContent.includes('beta.example'))
    root.querySelector('[aria-label="Clear all cache"]').click(); await settle()
    check('clear all does not accidentally keep current filter', calls.some(c=>c.method==='delete' && Object.keys(c.params).length===0))
    root.querySelectorAll('[role="tab"]')[1].click(); await settle()
    check('server cards show chain and resolver', root.querySelectorAll('[data-testid="dns-server-card"]').length===2 && root.textContent.includes('select → leaf') && root.textContent.includes('bootstrap'))
    check('rules are rendered', root.textContent.includes('domain_suffix=example.com'))
    const form = root.querySelector('form')
    const name = form.querySelector('input'); name.value='example.com';name.dispatchEvent(new Event('input'))
    const server = form.querySelectorAll('select')[1];server.value=JSON.stringify(['two','same']);server.dispatchEvent(new Event('change'))
    form.dispatchEvent(new Event('submit',{cancelable:true}));await settle()
    const queries = calls.filter(c=>c.url==='/dns/query')
    check('default A+AAAA queries carry selected server and scope', queries.length===2 && queries.every(c=>c.params.server==='same'&&c.params.scope==='two') && queries.map(c=>c.params.type).sort().join(',')==='A,AAAA')
    check('query results show actual DNS server and matched rule', root.querySelectorAll('[data-testid="dns-query-result"]').length===2 && root.textContent.includes('Manually selected server'))
    root.querySelector('[aria-label="Clear server cache same"]').click();await settle()
    check('server clear includes scope', calls.some(c=>c.method==='delete' && c.params.scope==='one' && c.params.server==='same'))
    const beforeGap = sockets.at(-1)
    frame(beforeGap, {full:true,revision:1,entries:[first],removed:[]});await settle()
    frame(beforeGap, {full:false,revision:99,entries:[],removed:[]});await settle()
    check('a missing delta forces resynchronization', beforeGap.closed)
    await new Promise(resolve=>setTimeout(resolve,2100));await settle()
    check('resynchronization reconnects', sockets.at(-1)!==beforeGap)
    frame(sockets.at(-1), {full:true,revision:1,entries:[first],removed:[]});await settle()
    const oldBackendSocket = sockets.at(-1)
    name.value='slow.example';name.dispatchEvent(new Event('input'));form.querySelector('select').value='A';form.querySelector('select').dispatchEvent(new Event('change'));form.dispatchEvent(new Event('submit',{cancelable:true}));await settle()
    setup.activeUuid.value='second';await settle()
    check('backend switch closes previous stream and aborts query', oldBackendSocket.closed && calls.filter(c=>c.url==='/dns/query').at(-1).signal.aborted)
    deferred?.();await settle()
    check('late query result cannot overwrite new backend', !root.textContent.includes('RCODE:'))
    app.unmount();await settle()
    check('unmount closes every stream', sockets.every(socket=>socket.closed))
    return checks
  })()`)
  console.log(results.join('\n'))
} finally {
  await browser?.close()
  await chrome?.close()
  await vite.close()
}

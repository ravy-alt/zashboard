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
    await import('/src/assets/main.css')
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
    let serverCount = 1
    let holdMetadata = false
    let releaseMetadata
    axios.defaults.adapter = async request => {
      calls.push({ url:request.url, method:request.method, params:request.params, signal:request.signal })
      let data = {}
      if (request.url === '/dns/servers') data = { servers:[
        {tag:'same',scope:'one',type:'https',address:'https://192.0.2.53:443/dns-query',dialerChain:['select','leaf'],resolver:'bootstrap',dependencies:['bootstrap'],cacheCount:serverCount,icon:'/favicon.svg'},
        {tag:'same',scope:'two',icon:'  ',type:'udp',address:'192.0.2.54:53',dialerChain:[],dependencies:[],cacheCount:1},
        {tag:'parallel',type:'race',address:'',dialerChain:[],dependencies:['same','backup'],cacheCount:2,default:true},
        {tag:'static',type:'hosts',address:'',dialerChain:[],dependencies:[],cacheCount:0},
      ] }
      if (request.url === '/dns/servers' && holdMetadata) {
        holdMetadata = false
        return await new Promise(resolve => { releaseMetadata = () => resolve({data,status:200,statusText:'OK',headers:{},config:request}) })
      }
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
    check('cache has no live status text', !root.querySelector('[role="status"]'))
    check('real cache rows display ports and rules', rows().length === 2 && rows()[0].textContent.includes('1234') && rows()[0].textContent.includes('first'))
    const dnsStore = await import('/src/store/dns.ts')
    const display = await import('/src/helper/dns-display.ts')
    const icons = await import('/src/constant/index.ts')
    check('DNS uses its own navigation icon', icons.ROUTE_ICON_MAP?.dns !== icons.ROUTE_ICON_MAP?.proxies)
    check('cache table uses alternating connection row styling', rows()[0].classList.contains('table-row-stripe') && !rows()[1].classList.contains('table-row-stripe'))
    check('delete is the first pinned cell', rows().every(row => row.firstElementChild.dataset.column === 'delete' && getComputedStyle(row.firstElementChild).position === 'sticky'))
    const hostHeader = () => root.querySelector('th[data-column="host"]')
    hostHeader().click();await settle()
    check('host sorting changes row order', rows()[0].dataset.rowId === 'second' && hostHeader().getAttribute('aria-sort') === 'descending')
    const resize = root.querySelector('[data-resize-column="host"]')
    const width = hostHeader().getBoundingClientRect().width
    const x = resize.getBoundingClientRect().x
    resize.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:x,button:0}))
    document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:x+80,buttons:1}));document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:x+80}));await settle()
    check('column widths are resizable and persisted', hostHeader().getBoundingClientRect().width > width+50 && JSON.parse(localStorage.getItem('config/dns-table-sort/column-widths')).host > width+50)
    check('resizing does not toggle sorting', hostHeader().getAttribute('aria-sort') === 'descending')
    root.querySelector('[aria-label="Cache table settings"]').click();await settle()
    const columnDialog = document.querySelector('[data-testid="dns-column-settings"]')
    columnDialog.querySelector('[aria-label="Hide column Purpose"]').click();await settle()
    check('column settings hide a column', !root.querySelector('th[data-column="purpose"]'))
    columnDialog.querySelector('[aria-label="Hide column Host"]').click();await settle()
    check('hiding the active sort column retains sort order', !root.querySelector('th[data-column="host"]') && rows()[0].dataset.rowId==='second')
    columnDialog.querySelector('[aria-label="Show column Host"]').click();await settle()

    columnDialog.querySelector('[aria-label="Show column Purpose"]').click();await settle()
    check('column settings restore a column and persist order', root.querySelector('th[data-column="purpose"]') && JSON.parse(localStorage.getItem('config/dns-table-columns')).at(-1) === 'purpose')
    document.querySelector('[role="dialog"] [aria-label="close"]').click();await settle()
    const rootEntry = {...first,id:'root',domain:'',type:'NS',addresses:[],answers:['.\t86400\tIN\tNS\ta.root-servers.net.','.\t86400\tIN\tNS\tb.root-servers.net.'],request:{cached:false,lastUsed:'0001-01-01T00:00:00Z',hits:0}}
    const manyAnswers = {...first,id:'many',domain:'many.example',answerData:Array.from({length:13},(_,i)=>'192.0.2.'+(i+1)),request:{...first.request,purpose:'proxy-server',rule:'specified-server',server:'leaf'}}
    frame(sockets.at(-1),{full:true,revision:1,entries:[rootEntry,manyAnswers,second],removed:[]});await settle()
    const rootRow = rows().find(row=>row.dataset.rowId==='root')
    check('root domain and legacy NS records display clearly', rootRow.querySelector('[data-column="host"]').textContent === 'Root domain (.)' && rootRow.querySelectorAll('[data-testid="dns-answers"] > div').length===2 && !rootRow.textContent.includes('86400'))
    check('missing history is not mislabeled as an internal query', rootRow.textContent.includes('Not recorded') && !rootRow.textContent.includes('Core lookup'))
    const manyRow = rows().find(row=>row.dataset.rowId==='many')
    check('every answer has its own line with dynamic row height', manyRow.querySelectorAll('[data-testid="dns-answers"] > div').length===13 && manyRow.getBoundingClientRect().height > rootRow.getBoundingClientRect().height)
    check('rule and purpose are separate concise columns', manyRow.querySelector('[data-column="purpose"]').textContent==='Proxy hostname' && manyRow.querySelector('[data-column="rule"]').textContent==='Specified server')
    check('DNS cache server chain uses connection arrows without wrapping', manyRow.querySelector('[data-testid="dns-chain"] svg') && getComputedStyle(manyRow.querySelector('[data-testid="dns-chain"]')).whiteSpace==='nowrap')
    const rectangles = rows().map(row=>row.getBoundingClientRect())
    check('multiline rows never overlap', rectangles.slice(1).every((rect,i)=>rect.top >= rectangles[i].bottom-1))
    const indexed = display.dnsRule({...first.request,rule:'26: domain_suffix=example.com => route(same)'}, key=>key)
    check('rule number matches the one-based server rule list', indexed.index==='#27' && indexed.title.startsWith('26:') && indexed.text==='domain_suffix=example.com => route(same)')
    // Tab remounts retain column configuration and sorting.
    root.querySelectorAll('[role="tab"]')[1].click();await settle()
    root.querySelectorAll('[role="tab"]')[0].click();await settle()
    check('table preferences survive tab switching', hostHeader().getAttribute('aria-sort')==='descending' && hostHeader().getBoundingClientRect().width > width+50)
    dnsStore.dnsColumns.value=[...dnsStore.defaultDnsColumns]
    hostHeader().click();await settle();hostHeader().click();await settle()
    frame(sockets.at(-1),{full:true,revision:1,entries:[first,second],removed:[]});await settle()

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
    check('server cards show chain and resolver', root.querySelectorAll('[data-testid="dns-server-card"]').length===4 && [...root.querySelectorAll('[data-testid="dns-chain"]')].some(chain => chain.title === 'select → leaf' && chain.querySelector('svg')) && root.textContent.includes('bootstrap'))
    check('rules are rendered', root.textContent.includes('domain_suffix=example.com'))
    const cards = [...root.querySelectorAll('[data-testid="dns-server-card"]')]
    check('cards distinguish direct, race and local records', cards[1].textContent.includes('Direct') && !cards[2].querySelector('[data-testid="dns-dialer"]') && cards[3].textContent.includes('No connection needed'))
    check('race servers occupy separate lines', cards[2].querySelectorAll('[data-testid="dns-race-members"] > div').length === 2)
    check('configured card icon is rendered', cards[0].querySelector('[data-testid="dns-server-icon"] img')?.getAttribute('src')==='/favicon.svg')
    check('unconfigured card icons leave no placeholder', cards.slice(1).every(card=>!card.querySelector('[data-testid="dns-server-icon"]')))
    check('fallback server and rules use final like connections', cards[2].querySelector('.badge').textContent==='final' && display.dnsRule({...first.request,rule:'default'}, key=>i18n.global.t(key)).text==='final')
    const cacheCount = () => root.querySelector('[data-testid="dns-cache-count"] dd').textContent.trim()
    const refresh = () => root.querySelector('[aria-label="Refresh"]')
    const countRequests = () => calls.filter(call=>call.url==='/dns/servers').length
    const beforeRefresh=countRequests();serverCount=17;refresh().click();await settle()
    check('manual refresh requests server metadata and updates cache counts', countRequests()>beforeRefresh && cacheCount()==='17' && !refresh().disabled)
    holdMetadata=true;refresh().click();await settle()
    check('refresh shows loading and blocks repeat clicks', refresh().disabled && refresh().querySelector('.animate-spin'))
    serverCount=29
    root.querySelectorAll('[role="tab"]')[0].click();await settle()
    root.querySelectorAll('[role="tab"]')[1].click();await settle()
    check('entering the server tab refreshes metadata', cacheCount()==='29')
    releaseMetadata();await settle()
    check('a late refresh cannot restore stale counts', cacheCount()==='29' && !refresh().disabled)
    serverCount=37
    const automaticDeadline=Date.now()+6500
    while(cacheCount()!=='37' && Date.now()<automaticDeadline) await settle()
    check('server cache counts also refresh automatically', cacheCount()==='37')
    check('cache count is below its label at the bottom of each card', cards.every(card=> {const count=card.querySelector('[data-testid="dns-cache-count"]');return count===card.lastElementChild && count.querySelector('dd').getBoundingClientRect().top >= count.querySelector('dt').getBoundingClientRect().bottom}))

    const form = root.querySelector('form')
    const name = form.querySelector('input'); name.value='example.com';name.dispatchEvent(new Event('input'))
    const server = form.querySelectorAll('select')[1];server.value=JSON.stringify(['two','same']);server.dispatchEvent(new Event('change'))
    form.dispatchEvent(new Event('submit',{cancelable:true}));await settle()
    const queries = calls.filter(c=>c.url==='/dns/query')
    check('default A+AAAA queries carry selected server and scope', queries.length===2 && queries.every(c=>c.params.server==='same'&&c.params.scope==='two') && queries.map(c=>c.params.type).sort().join(',')==='A,AAAA')
    check('query results show actual DNS server and matched rule', root.querySelectorAll('[data-testid="dns-query-result"]').length===2 && root.textContent.includes('Manual selection'))
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
    const { default: LogsTable } = await import('/src/components/logs/LogsTable.vue')
    const logApp=createApp(LogsTable,{logs:[{seq:2,time:'12:00:01',type:'info',payload:'second log'},{seq:1,time:'12:00:00',type:'info',payload:'first log'}]}).use(i18n)
    logApp.mount(root);await settle()
    check('shared table preserves log rendering without resize controls', root.textContent.includes('first log') && root.textContent.includes('second log') && !root.querySelector('[data-resize-column]'))
    root.querySelector('th[data-column="seq"]').click();await settle()
    check('shared table preserves numeric log sorting', root.querySelector('tbody tr[data-row-id] [data-column="seq"]').textContent==='2')
    logApp.unmount()
    const ruleAssembly=await import('/src/assembly/rules.ts')
    ruleAssembly.rules.value=[{type:'DomainSuffix',payload:'example.org',proxy:'DIRECT'}]
    const { default: RulesTable }=await import('/src/components/rules/RulesTable.vue')
    const ruleApp=createApp(RulesTable).use(i18n);ruleApp.mount(root);await settle()
    check('shared table preserves rule cells and hidden optional columns', root.textContent.includes('example.org') && root.textContent.includes('DIRECT') && !root.querySelector('th[data-column="hitMiss"]'))
    ruleApp.unmount()

    return checks
  })()`)
  console.log(results.join('\n'))
} finally {
  await browser?.close()
  await chrome?.close()
  await vite.close()
}

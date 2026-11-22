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
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/test/browser.html`)
  assert.notEqual(
    await waitFor(async () => page.evaluate('typeof __APP_VERSION__ !== "undefined"')),
    null,
  )
  const results = await page.evaluate(`(async () => {
    const setup = await import('/src/store/setup.ts')
    const backend = await import('/src/assembly/backend.ts')
    const state = await import('/src/assembly/proxies/state.ts')
    const actions = await import('/src/assembly/proxies/actions.ts')
    const udp = await import('/src/assembly/proxies/udp.ts')
    const latency = await import('/src/assembly/proxies/latency.ts')
    const settings = await import('/src/store/settings.ts')
    const { axios,createApp,h,nextTick } = await import('/test/lib/browser-deps.ts')
    const { i18n } = await import('/src/i18n/index.ts')
    const {default:Card}=await import('/src/components/proxies/ProxyNodeCard.vue')
    const checks=[]
    const check=(name,ok)=>{if(!ok)throw new Error(name);checks.push(name)}
    const settle=async()=>{await nextTick();await new Promise(resolve=>setTimeout(resolve,40));await nextTick()}
    setup.backendList.value=[{uuid:'udp-test',type:'clash',protocol:'http',host:'127.0.0.1',port:'1',secondaryPath:'',password:''}]
    setup.activeUuid.value='udp-test'
    backend.core.value=backend.Core.SingBox
    backend.singBoxCapabilities.value=[]
    settings.IPv6test.value=false
    const profile={server:'8.8.4.4',port:5353,domain:'probe.example.',timeout:1234}
    const nodes={
      A:{name:'A',type:'SmartURLTest',now:'B',all:['B','x'],testUrl:'https://tcp.example/',udpTest:profile,history:[],extra:{}},
      B:{name:'B',type:'Selector',now:'x',all:['x','y'],history:[],extra:{}},
      x:{name:'x',type:'AnyTLS',udp:true,history:[],extra:{},udpHistory:{},'x-sing-box-revision':'epoch:1'},
      y:{name:'y',type:'AnyTLS',udp:true,history:[],extra:{},udpHistory:{},'x-sing-box-revision':'epoch:1'},
    }
    let alive=false,calls=[],release,hold=false
    axios.defaults.adapter=async request=>{
      calls.push({path:request.url,params:request.params})
      let data={}
      if(request.url==='/proxies')data={proxies:structuredClone(nodes)}
      else if(request.url==='/providers/proxies')data={providers:{}}
      else if(request.url.endsWith('/udp-delay')){
        const name=decodeURIComponent(request.url.split('/').at(-2))
        const revision=nodes[name]['x-sing-box-revision']
        if(hold){hold=false;await new Promise(resolve=>{release=resolve})}
        data={...request.params,outbound:name,alive,delay:alive?37:0,time:new Date().toISOString()}
        if(nodes[name]?.['x-sing-box-revision']===revision)nodes[name].udpHistory[JSON.stringify(request.params)]=data
      }
      else if(request.url.endsWith('/delay')) data=request.url.startsWith('/group/')?{B:20,x:20}:{delay:20}
      return {data,status:200,statusText:'OK',headers:{},config:request}
    }
    await actions.fetchProxies()
    const app=createApp({render:()=>h(Card,{name:'B',groupName:'A'})}).use(i18n)
    app.mount('#app');await settle()
    check('older core does not advertise untested UDP support from its flag',!document.querySelector('[data-testid=udp-probe]') && !document.querySelector('#app').textContent.includes('/ udp'))
    backend.singBoxCapabilities.value=['udp-probe-v1'];await settle()
    const button=()=>document.querySelector('[data-testid=udp-probe]')
    check('UDP begins unknown even for an UDP-capable protocol',button().textContent.trim()==='UDP ?')
    button().click();await settle()
    const request=calls.find(c=>c.path.endsWith('/udp-delay'))
    check('nested card probes actual leaf with the parent group DNS target',request.path==='/proxies/x/udp-delay' && JSON.stringify(request.params)===JSON.stringify(profile))
    check('failed real exchange overrides protocol UDP capability',button().textContent.trim()==='UDP ×' && nodes.x.udp)
    alive=true;button().click();await settle()
    check('successful probe displays measured UDP latency',button().textContent.trim()==='UDP 37ms')
    nodes.B.now='y';await actions.fetchProxies();await settle()
    check('switching a nested selection never borrows old leaf UDP results',button().textContent.trim()==='UDP ?')
    nodes.A.udpTest={...profile,domain:'different.example.'};await actions.fetchProxies();await settle()
    await udp.testUDP('x','A');await actions.fetchProxies()
    check('UDP histories isolate DNS domains and timeout profiles',Object.values(nodes.x.udpHistory).length===2 && udp.getUDPResult('x','A')?.domain==='different.example.')
    nodes.B.now='x';await actions.fetchProxies();calls=[]
    await udp.testGroupUDP(['B','x'],'A')
    check('batch UDP probes deduplicate nested aliases',calls.filter(c=>c.path.endsWith('/udp-delay')).length===1)
    calls=[];await latency.proxyLatencyTest('B','https://tcp.example/',500, 'A')
    check('ordinary latency action also performs a real UDP query',calls.some(c=>c.path==='/proxies/x/udp-delay') && calls.some(c=>c.path==='/proxies/B/delay'))
    calls=[];await latency.proxyGroupLatencyTest('A')
    check('group latency action includes UDP for each selected leaf',calls.some(c=>c.path==='/group/A/delay') && calls.filter(c=>c.path.endsWith('/udp-delay')).length===1)
    hold=true;const pending=udp.testUDP('x','A');await settle()
    nodes.x={...nodes.x,'x-sing-box-revision':'epoch:2',udpHistory:{}}
    await actions.fetchProxies();release();await pending;await actions.fetchProxies();await settle()
    check('a refreshed node cannot inherit the replaced node UDP result',button().textContent.trim()==='UDP ?')
    delete nodes.x;await actions.fetchProxies();await settle()
    check('removed leaf does not keep a UDP badge',udp.getUDPResult('B','A')===undefined)
    nodes.x={name:'x',type:'AnyTLS',udp:true,history:[],extra:{},udpHistory:{},'x-sing-box-revision':'epoch:3'}
    await actions.fetchProxies();await settle()
    check('same-name re-addition starts without an old UDP result',button().textContent.trim()==='UDP ?')
    app.unmount()
    return checks
  })()`)
  console.log(results.join('\n'))
} finally {
  await browser?.close()
  await chrome?.close()
  await vite.close()
}

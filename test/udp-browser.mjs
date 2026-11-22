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
    const { NOT_CONNECTED } = await import('/src/constant/index.ts')
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
    let alive=false,calls=[],release,hold=false,tcpFail=false
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
      else if(request.url.endsWith('/delay')) {
        nodes.x.extra['https://tcp.example/']={alive:!tcpFail,history:[{time:new Date().toISOString(),delay:tcpFail?0:25}]}
        if(tcpFail)throw new Error('TCP failed')
        data=request.url.startsWith('/group/')?{B:25,x:25}:{delay:25}
      }
      return {data,status:200,statusText:'OK',headers:{},config:request}
    }
    await actions.fetchProxies()
    const app=createApp({render:()=>h(Card,{name:'B',groupName:'A'})}).use(i18n)
    app.mount('#app');await settle()
    check('older core does not advertise untested UDP support from its flag',!document.querySelector('[data-testid=udp-probe]') && !document.querySelector('#app').textContent.includes('/ udp'))
    backend.singBoxCapabilities.value=['udp-probe-v1'];await settle()
    const label=()=>document.querySelector('#app .tracking-tight').textContent.trim()
    const latencyTag=()=>document.querySelector('#app .latency-tag')
    check('original card layout has no separate UDP control',!document.querySelector('[data-testid=udp-probe]') && document.querySelectorAll('#app .items-center.justify-between > *').length===2)
    check('untested UDP is hidden even for an UDP-capable protocol',label()==='selector')
    latencyTag().click();await settle()
    const request=calls.find(c=>c.path.endsWith('/udp-delay'))
    check('original TCP control also probes actual leaf with parent DNS target',request.path==='/proxies/x/udp-delay' && JSON.stringify(request.params)===JSON.stringify(profile))
    check('failed UDP hides its label and preserves TCP latency',label()==='selector' && state.getLatencyByName('B','A')===25 && nodes.x.udp)
    alive=true;latencyTag().click();await settle()
    check('successful UDP uses only the original inline label',label()==='selector / udp' && !document.querySelector('#app').textContent.includes('37ms'))
    check('original latency component shows TCP, never UDP delay',latencyTag().textContent.trim()==='25')
    alive=false;hold=true;latencyTag().click();await settle()
    check('TCP result and loading finish without waiting for UDP',typeof release==='function' && !latencyTag().querySelector('.loading:not(.latency-state-leave-active)') && latencyTag().textContent.trim()==='25')
    release();await settle()
    check('background UDP failure removes the label without changing TCP',label()==='selector' && latencyTag().textContent.trim()==='25')
    tcpFail=true;alive=true;latencyTag().click();await settle()
    check('UDP success cannot mask a failed TCP probe',label()==='selector / udp' && state.getLatencyByName('B','A')===NOT_CONNECTED && latencyTag().querySelector('svg'))
    tcpFail=false
    nodes.B.now='y';await actions.fetchProxies();await settle()
    check('nested selection never borrows old leaf UDP results',label()==='selector')
    nodes.A.udpTest={...profile,domain:'different.example.'};await actions.fetchProxies();await settle()
    await udp.testUDP('x','A');await actions.fetchProxies()
    check('UDP histories isolate DNS domains and timeout profiles',Object.values(nodes.x.udpHistory).length===2 && udp.getUDPResult('x','A')?.domain==='different.example.')
    nodes.B.now='x';await actions.fetchProxies();calls=[]
    await udp.testGroupUDP(['B','x'],'A')
    check('batch UDP probes deduplicate nested aliases',calls.filter(c=>c.path.endsWith('/udp-delay')).length===1)
    calls=[];await latency.proxyLatencyTest('B','https://tcp.example/',500, 'A');await settle()
    check('ordinary latency action also performs a real UDP query',calls.some(c=>c.path==='/proxies/x/udp-delay') && calls.some(c=>c.path==='/proxies/B/delay'))
    calls=[];await latency.proxyGroupLatencyTest('A');await settle()
    check('group latency action includes UDP for each selected leaf',calls.some(c=>c.path==='/group/A/delay') && calls.filter(c=>c.path.endsWith('/udp-delay')).length===1)
    hold=true;let groupFinished=false
    const groupPending=latency.proxyGroupLatencyTest('A').then(()=>{groupFinished=true})
    await settle()
    check('group TCP action also completes while UDP is pending',groupFinished)
    release();await groupPending;await settle()
    hold=true;const pending=udp.testUDP('x','A');await settle()
    nodes.x={...nodes.x,'x-sing-box-revision':'epoch:2',udpHistory:{}}
    await actions.fetchProxies();release();await pending;await actions.fetchProxies();await settle()
    check('a refreshed node cannot inherit the replaced node UDP result',label()==='selector')
    delete nodes.x;await actions.fetchProxies();await settle()
    check('removed leaf does not keep a UDP badge',udp.getUDPResult('B','A')===undefined)
    nodes.x={name:'x',type:'AnyTLS',udp:true,history:[],extra:{},udpHistory:{},'x-sing-box-revision':'epoch:3'}
    await actions.fetchProxies();await settle()
    check('same-name re-addition starts without an old UDP result',label()==='selector')
    backend.core.value=backend.Core.Mihomo;nodes.B.udp=true;nodes.B.xudp=true
    await actions.fetchProxies();await settle()
    check('other backends retain the original UDP and XUDP presentation',label()==='selector / xudp')
    app.unmount()
    return checks
  })()`)
  console.log(results.join('\n'))
} finally {
  await browser?.close()
  await chrome?.close()
  await vite.close()
}

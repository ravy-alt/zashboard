import type { Proxy } from '@/types'

// Use the native type only for presentation. Keep proxy.type intact for
// group detection, latency tests and compatibility with other Clash cores.
export const proxyTypeLabel = (proxy: Pick<Proxy, 'type' | 'x-sing-box-type'>) =>
  proxy['x-sing-box-type'] === 'smart-urltest' ? 'smart-urltest' : proxy.type

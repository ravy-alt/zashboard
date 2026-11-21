// IPv6 support describes a tested runtime node, not a display name. Keep it in
// memory: legacy persisted booleans cannot identify the backend or generation.
type Entry = { identity: string; probe: number; supported?: boolean }
export type IPv6Probe = { name: string; entry: Entry; probe: number; session: number }

export class IPv6Cache {
  private backend = ''
  private entries = new Map<string, Entry>()
  session = 0

  switchBackend(backend: string) {
    if (backend === this.backend) return
    this.backend = backend
    this.session++
    this.entries.clear()
  }

  reconcile(identities: Record<string, string>) {
    const next = new Map<string, Entry>()
    for (const [name, identity] of Object.entries(identities)) {
      const previous = this.entries.get(name)
      next.set(name, previous?.identity === identity ? previous : { identity, probe: 0 })
    }
    this.entries = next
  }

  begin(name: string): IPv6Probe | undefined {
    const entry = this.entries.get(name)
    if (!entry) return
    return { name, entry, probe: ++entry.probe, session: this.session }
  }

  finish(ticket: IPv6Probe | undefined, supported: boolean) {
    if (
      !ticket ||
      ticket.session !== this.session ||
      this.entries.get(ticket.name) !== ticket.entry ||
      ticket.probe !== ticket.entry.probe
    )
      return
    ticket.entry.supported = supported
  }

  snapshot(): Record<string, boolean> {
    return Object.fromEntries(
      [...this.entries]
        .filter(([, entry]) => entry.supported !== undefined)
        .map(([name, entry]) => [name, entry.supported!]),
    )
  }
}

type NodeIdentity = {
  id?: string
  type: string
  'provider-name'?: string
  'dialer-proxy'?: string
  'x-sing-box-revision'?: string
}
type ProviderIdentity = { name: string; updatedAt?: string; generation?: number }

export const ipv6Identities = (
  proxies: Record<string, NodeIdentity>,
  providers: ProviderIdentity[],
): Record<string, string> => {
  const versions = new Map(providers.map((p) => [p.name, [p.updatedAt, p.generation]]))
  return Object.fromEntries(
    Object.entries(proxies).map(([name, p]) => [
      name,
      JSON.stringify([
        p['x-sing-box-revision'],
        p.id,
        p.type,
        p['provider-name'],
        p['dialer-proxy'],
        versions.get(p['provider-name'] ?? ''),
      ]),
    ]),
  )
}

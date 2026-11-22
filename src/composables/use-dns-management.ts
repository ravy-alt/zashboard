import type { DnsCacheEntry, DnsRule, DnsServer } from '@/api/dns'
import { deleteDnsCache, fetchDnsRules, fetchDnsServers, openDnsCache } from '@/api/dns'
import { can } from '@/assembly/backend'
import { getRequestErrorMessage } from '@/helper/request-error'
import { activeBackend } from '@/store/setup'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'

export const useDnsManagement = () => {
  const entries = shallowRef(new Map<string, DnsCacheEntry>())
  const servers = ref<DnsServer[]>([])
  const rules = ref<DnsRule[]>([])
  const paused = ref(false)
  const connected = ref(false)
  const streamRevision = ref(0)
  const error = ref('')
  const busy = ref(false)
  const refreshing = ref(false)
  const supported = computed(() => can('dnsManagement'))
  let controller = new AbortController()
  let metadataTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let metadataRevision = 0

  const refreshMetadata = async (signal = controller.signal) => {
    if (signal.aborted || disposed) return
    const revision = ++metadataRevision
    refreshing.value = true
    try {
      const [nextServers, nextRules] = await Promise.all([
        fetchDnsServers(signal),
        fetchDnsRules(signal),
      ])
      if (signal.aborted || revision !== metadataRevision) return
      servers.value = nextServers
      rules.value = nextRules
      error.value = ''
    } catch (e) {
      if (!signal.aborted && revision === metadataRevision) error.value = getRequestErrorMessage(e)
    } finally {
      if (!signal.aborted && revision === metadataRevision) refreshing.value = false
    }
  }

  const refreshServers = () => {
    if (activeBackend.value && supported.value) return refreshMetadata()
  }

  watch(
    [activeBackend, supported],
    ([backend, enabled], _, cleanup) => {
      controller.abort()
      controller = new AbortController()
      const signal = controller.signal
      entries.value = new Map()
      servers.value = []
      rules.value = []
      error.value = ''
      busy.value = false
      refreshing.value = false
      const poll = async () => {
        await refreshMetadata(signal)
        if (!signal.aborted && !disposed) metadataTimer = setTimeout(poll, 5000)
      }
      if (backend && enabled) void poll()
      cleanup(() => {
        controller.abort()
        clearTimeout(metadataTimer)
      })
    },
    { immediate: true },
  )

  watch(
    [activeBackend, supported, paused, streamRevision],
    ([backend, enabled, stopped], _, cleanup) => {
      connected.value = false
      if (!backend || !enabled || stopped) return
      const close = openDnsCache(
        backend,
        (frame) => {
          const next = frame.full ? new Map<string, DnsCacheEntry>() : new Map(entries.value)
          for (const id of frame.removed) next.delete(id)
          for (const entry of frame.entries) next.set(entry.id, entry)
          entries.value = next
        },
        (state) => {
          connected.value = state
        },
      )
      cleanup(close)
    },
    { immediate: true },
  )

  const remove = async (params: { id?: string; scope?: string; server?: string }) => {
    if (busy.value || !supported.value) return
    const signal = controller.signal
    busy.value = true
    try {
      await deleteDnsCache(params, signal)
      if (signal.aborted) return
      entries.value = new Map(
        [...entries.value].filter(([id, entry]) => {
          if (params.id) return id !== params.id
          if (params.server)
            return entry.server !== params.server || (entry.scope ?? '') !== (params.scope ?? '')
          return false
        }),
      )
      // A new DNS answer can arrive between deletion and its HTTP response.
      // Resync so local removal cannot permanently hide an already-sent delta.
      streamRevision.value++
      await refreshMetadata(signal)
    } catch (e) {
      if (!signal.aborted) error.value = getRequestErrorMessage(e)
    } finally {
      if (!signal.aborted) busy.value = false
    }
  }

  onScopeDispose(() => {
    disposed = true
    controller.abort()
    clearTimeout(metadataTimer)
  })
  return {
    entries,
    servers,
    rules,
    paused,
    connected,
    error,
    busy,
    refreshing,
    supported,
    remove,
    refreshServers,
  }
}

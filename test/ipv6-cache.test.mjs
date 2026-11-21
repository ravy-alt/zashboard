import assert from 'node:assert/strict'
import { test } from 'node:test'
import { IPv6Cache, ipv6Identities } from '../src/assembly/proxies/ipv6-cache.ts'

const makeCache = () => {
  const cache = new IPv6Cache()
  cache.switchBackend('backend-a')
  cache.reconcile({ 香港: 'runtime-a:1', '香港-1': 'runtime-a:1' })
  return cache
}
const mark = (cache, name = '香港', supported = true) => cache.finish(cache.begin(name), supported)

test('ordinary polling preserves a result for the same runtime node', () => {
  const cache = makeCache()
  mark(cache)
  cache.reconcile({ 香港: 'runtime-a:1', '香港-1': 'runtime-a:1' })
  assert.deepEqual(cache.snapshot(), { 香港: true })
})

test('same-name node or dialer/DNS graph replacement invalidates old results and in-flight probes', () => {
  const cache = makeCache()
  mark(cache)
  const pending = cache.begin('香港')
  cache.reconcile({ 香港: 'runtime-a:2', '香港-1': 'runtime-a:2' })
  cache.finish(pending, true)
  assert.deepEqual(cache.snapshot(), {})
  mark(cache, '香港', false)
  assert.deepEqual(cache.snapshot(), { 香港: false })
})

test('deletion and reintroduction cannot resurrect a name-based badge or pending result', () => {
  const cache = makeCache()
  mark(cache)
  mark(cache, '香港-1')
  const pending = cache.begin('香港')
  cache.reconcile({ '香港-1': 'runtime-a:1' })
  cache.reconcile({ 香港: 'runtime-a:1', '香港-1': 'runtime-a:1' })
  cache.finish(pending, true)
  assert.deepEqual(cache.snapshot(), { '香港-1': true })
})

test('switching backends, including A → B → A, rejects stale probes', () => {
  const cache = makeCache()
  mark(cache)
  const pending = cache.begin('香港')
  cache.switchBackend('backend-b')
  cache.reconcile({ 香港: 'runtime-a:1' })
  cache.finish(pending, true)
  assert.deepEqual(cache.snapshot(), {})
  cache.switchBackend('backend-a')
  cache.reconcile({ 香港: 'runtime-a:1' })
  cache.finish(pending, true)
  assert.deepEqual(cache.snapshot(), {})
})

test('a restarted core invalidates a same-tag same-generation result', () => {
  const cache = makeCache()
  mark(cache)
  cache.reconcile({ 香港: 'runtime-b:1' })
  assert.deepEqual(cache.snapshot(), {})
})

test('a late successful probe cannot overwrite a newer failed probe', () => {
  const cache = makeCache()
  const old = cache.begin('香港')
  mark(cache, '香港', false)
  cache.finish(old, true)
  assert.deepEqual(cache.snapshot(), { 香港: false })
})

test('provider timestamp/generation invalidates legacy nodes without the revision extension', () => {
  const cache = new IPv6Cache()
  const proxies = { 香港: { type: 'ss', 'provider-name': 'source' } }
  cache.reconcile(ipv6Identities(proxies, [{ name: 'source', updatedAt: 'first', generation: 1 }]))
  mark(cache)
  cache.reconcile(ipv6Identities(proxies, [{ name: 'source', updatedAt: 'second', generation: 2 }]))
  assert.deepEqual(cache.snapshot(), {})
})

test('different providers and public collision suffixes keep independent identities', () => {
  const cache = new IPv6Cache()
  const proxies = {
    香港: { type: 'ss', 'provider-name': 'a' },
    '香港-1': { type: 'ss', 'provider-name': 'b' },
  }
  cache.reconcile(
    ipv6Identities(proxies, [
      { name: 'a', generation: 1 },
      { name: 'b', generation: 1 },
    ]),
  )
  mark(cache)
  mark(cache, '香港-1')
  cache.reconcile(
    ipv6Identities(proxies, [
      { name: 'a', generation: 2 },
      { name: 'b', generation: 1 },
    ]),
  )
  assert.deepEqual(cache.snapshot(), { '香港-1': true })
})

test('an unobserved delete/readd is caught by the backend graph revision', () => {
  const cache = new IPv6Cache()
  const node = { type: 'ss', 'x-sing-box-revision': 'runtime:1' }
  cache.reconcile(ipv6Identities({ 香港: node }, []))
  mark(cache)
  node['x-sing-box-revision'] = 'runtime:3'
  cache.reconcile(ipv6Identities({ 香港: node }, []))
  assert.deepEqual(cache.snapshot(), {})
})

test('reload starts without persisted legacy booleans', () => {
  const old = makeCache()
  mark(old)
  assert.deepEqual(makeCache().snapshot(), {})
})

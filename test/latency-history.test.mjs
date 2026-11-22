import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scopedHistory, selectedLeafName } from '../src/assembly/proxies/latency-history.ts'

const bucket = (delay) => ({ history: [{ time: '2026-01-01', delay }] })
const nodes = () => ({
  A: { all: ['B'], now: 'B', extra: { a: bucket(999) } },
  B: { all: ['C', 'y'], now: 'C', extra: { b: bucket(998) } },
  C: { all: ['x'], now: 'x' },
  x: { extra: { a: bucket(10), b: bucket(20), c: bucket(30) } },
  y: { extra: { a: bucket(11), b: bucket(21), c: bucket(31) } },
})

test('nested groups use the query URL and final leaf, ignoring stored group copies', () => {
  const map = nodes()
  assert.equal(selectedLeafName(map, 'A'), 'x')
  for (const [name, url, delay] of [
    ['A', 'a', 10],
    ['B', 'b', 20],
    ['C', 'c', 30],
    ['A', 'b', 20],
  ]) {
    assert.equal(scopedHistory(map, name, url)[0].delay, delay)
  }
  map.B.now = 'y'
  assert.equal(scopedHistory(map, 'A', 'a')[0].delay, 11)
  assert.equal(scopedHistory(map, 'B', 'b')[0].delay, 21)
  assert.equal(scopedHistory(map, 'C', 'c')[0].delay, 30)
})

test('missing or failed URLs never borrow another URL or stale history', () => {
  const map = nodes()
  map.x.history = bucket(1).history
  map.x.extra.failed = { history: [] }
  assert.equal(scopedHistory(map, 'A', 'unmeasured'), undefined)
  assert.deepEqual(scopedHistory(map, 'A', 'failed'), [])
})

test('missing, empty, cyclic, deleted and reintroduced selections have no stale latency', () => {
  const map = nodes()
  map.C.all = ['x', 'A']
  map.C.now = 'A'
  assert.equal(selectedLeafName(map, 'A'), undefined)
  map.C.now = ''
  assert.equal(scopedHistory(map, 'A', 'a'), undefined)
  map.C.now = 'x'
  delete map.x
  assert.equal(scopedHistory(map, 'A', 'a'), undefined)
  map.x = { extra: {} }
  assert.equal(scopedHistory(map, 'A', 'a'), undefined)
  map.x.extra.a = bucket(55)
  assert.equal(scopedHistory(map, 'A', 'a')[0].delay, 55)
})

test('a removed selection cannot resolve through a surviving node with the same name', () => {
  const map = nodes()
  map.B.all = ['y']
  assert.equal(selectedLeafName(map, 'A'), undefined)
  assert.equal(scopedHistory(map, 'A', 'a'), undefined)
  map.B.all = []
  assert.equal(selectedLeafName(map, 'B'), undefined)
  map.B.now = 'y'
  map.B.all = ['y']
  assert.equal(scopedHistory(map, 'A', 'a')[0].delay, 11)
})

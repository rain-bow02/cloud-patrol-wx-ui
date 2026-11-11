import test from 'node:test'
import assert from 'node:assert/strict'
import { historyQuery } from '../mobile/history.ts'
test('history filters use original category/level IDs and Shanghai half-open range before server pagination', () => {
  const filters = { from: '2026-11-01', to: '2026-11-03', pointName: ' Water ', categoryId: 'cat', levelId: 'level' }
  const query = historyQuery(filters, 2)
  assert.equal(query.pageIndex, 2); assert.equal(query.pageSize, 20)
  assert.deepEqual(query.terms, [
    { column: 'receiveTime', termType: 'gte', value: Date.parse('2026-11-01T00:00:00+08:00') },
    { column: 'receiveTime', termType: 'lt', value: Date.parse('2026-11-04T00:00:00+08:00') },
    { column: 'pointName', termType: 'like', value: '%Water%' },
    { column: 'categoryId', termType: 'eq', value: 'cat' },
    { column: 'levelId', termType: 'eq', value: 'level' },
  ])
  assert.deepEqual(query.sorts, [{ name: 'receiveTime', order: 'desc' }, { name: 'id', order: 'desc' }])
  assert.equal(historyQuery({ ...filters, pointName: '', categoryId: '', levelId: '' }).terms.length, 2)
  assert.throws(() => historyQuery({ ...filters, to: '2026-10-31' }), /Mobile.invalidHistoryRange/)
})

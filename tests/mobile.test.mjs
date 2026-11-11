import test from 'node:test'
import assert from 'node:assert/strict'
import { answerErrors, submissionFor, newRequestId, imageAllowed } from '../mobile/model.ts'
import { pendingStore } from '../mobile/pending.ts'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

test('H5实际入口为项目选择和加载失败注册中英文文案', async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../mobile/main.ts', import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['vue', 'vue-i18n'],
    plugins: [{ name: 'entry-shell', setup(builder) {
      builder.onResolve({ filter: /\.vue$|\.css$/ }, args => ({ path: args.path, namespace: 'entry-shell' }))
      builder.onLoad({ filter: /.*/, namespace: 'entry-shell' }, () => ({ contents: 'export default {}' }))
    }}]
  })
  const module = { exports: {} }
  const require = createRequire(import.meta.url)
  let i18n
  const entryRequire = name => name === 'vue'
    ? { createApp: () => ({ use(value) { i18n = value; return this }, mount() {} }) }
    : require(name)
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(entryRequire, module, module.exports)
  for (const locale of ['zh', 'en']) {
    i18n.global.locale.value = locale
    for (const key of ['Patrol.projects.all', 'Patrol.projects.failed', 'Patrol.missed.title']) {
      assert.equal(i18n.global.te(key), true, `${locale}: ${key}`)
      assert.notEqual(i18n.global.t(key), key)
    }
  }
  assert.equal(i18n.global.t('Patrol.projects.all', {}, { locale: 'zh' }), '全部有权限的项目')
})
const choice = { id: 'lock', title: 'Lock', required: true, options: ['normal', 'abnormal'] }
const number = { id: 'pressure', title: 'Pressure', type: { value: 'number', text: 'Number' }, required: true, options: [] }
const image = { id: 'image', title: 'Image', type: 'image', required: true, options: [] }
test('mobile validation requires answers and evidence without guessing pass/fail', () => {
  assert.deepEqual(answerErrors([choice, number, image], []), { lock: 'Mobile.required', pressure: 'Mobile.required', image: 'Mobile.photoRequired' })
  assert.deepEqual(answerErrors([choice], [{ itemId: 'lock', value: 'unexpected' }]), { lock: 'Mobile.invalidChoice' })
  assert.deepEqual(answerErrors([{ ...choice, photoRequired: true }], [{ itemId: 'lock', value: 'normal' }]), { lock: 'Mobile.photoRequired' })
  assert.deepEqual(answerErrors([image], [{ itemId: 'image', attachmentId: 'evidence' }]), {})
  assert.deepEqual(answerErrors([choice], [{ itemId: 'lock', value: 'abnormal' }]), {})
})
test('mobile preserves precise decimals and rejects scientific notation and oversized input', () => {
  for (const value of ['999999999999999999.123456', '-0.000001', '+12.25'])
    assert.deepEqual(answerErrors([number], [{ itemId: number.id, value }]), {})
  for (const value of ['1e3', 'NaN', '1.1234567', '9999999999999999999'])
    assert.equal(answerErrors([number], [{ itemId: number.id, value }]).pressure, 'Mobile.invalidNumber')
})
test('submission is a detached snapshot with only task items and an immutable retry body', () => {
  const task = { id: 'task', standardSnapshot: [number, image] }
  const answers = [{ itemId: 'pressure', value: ' 999999999999999999.123456 ' }, { itemId: 'image', value: 'discard', attachmentId: 'photo' }, { itemId: 'injected', value: 'x' }]
  const payload = submissionFor(task, answers, ' note ', 'original-request', { collectedTime: 1793751000000, networkStatus: 'online' })
  answers[0].value = 'new'
  assert.deepEqual(payload, { taskId: 'task', requestId: 'original-request', collectedTime: 1793751000000, networkStatus: 'online', remark: 'note', answers: [
    { itemId: 'pressure', value: '999999999999999999.123456', attachmentId: null }, { itemId: 'image', value: null, attachmentId: 'photo' }] })
})
test('pending requests survive reload and are isolated by project, application and user', () => {
  const map = new Map(), storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }
  const context = { projectId: 'north', applicationId: 'app', userId: 'alice' }
  const submission = { taskId: 'task', requestId: newRequestId(), answers: [], remark: '', collectedTime: 1793751000000, networkStatus: 'offline' }
  const pending = { row: { task: { id: 'task' }, executable: true, reason: '' }, submission }
  pendingStore(storage).write(context, pending)
  assert.deepEqual(pendingStore(storage).read(context), pending)
  for (const change of [{ projectId: 'south' }, { applicationId: 'other' }, { userId: 'bob' }])
    assert.equal(pendingStore(storage).read({ ...context, ...change }), undefined)
  pendingStore(storage).clear(context)
  assert.equal(pendingStore(storage).read(context), undefined)
})
test('image checks reject empty, unsupported and oversized files', () => {
  assert.equal(imageAllowed({ type: 'image/png', size: 5 * 1024 * 1024 }), true)
  for (const file of [{ type: 'image/png', size: 0 }, { type: 'image/svg+xml', size: 1 }, { type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 }])
    assert.equal(imageAllowed(file), false)
})

test('point grid groups the same physical point without discarding its assigned tasks', async () => {
  const { pointGroups } = await import('../mobile/points.ts')
  const row = (id, pointId, extra = {}) => ({ task: { id, pointId, pointName: pointId, startTime: 10, endTime: 20, requiredCount: 1, completedCount: 0, ...extra }, executable: false, reason: '' })
  const rows = [row('a', 'gate'), { ...row('b', 'gate'), executable: true }, row('future', 'future', { startTime: 20, endTime: 30 }), row('old', 'old', { startTime: 0, endTime: 10 })]
  const groups = pointGroups(rows, '', '', [], 10)
  assert.equal(groups.length, 1); assert.equal(groups[0].state, 'ready')
  assert.deepEqual(groups[0].rows.map(row => row.task.id), ['a', 'b'])
  assert.equal(pointGroups(rows, '', '', [], 20)[0].id, 'future')
})
test('point grid filters names and category descendants and renders truthful status priorities', async () => {
  const { pointGroups } = await import('../mobile/points.ts')
  const task = { id: 'task', pointId: 'Gate', pointName: 'Gate East', startTime: 10, endTime: 20, requiredCount: 1, completedCount: 0, categoryId: 'child' }
  const cooling = { task, executable: false, reason: 'error.patrol.execution.cooldown' }
  const categories = [{ id: 'child', parentId: 'parent', name: 'Child' }, { id: 'parent', name: 'Parent' }]
  assert.equal(pointGroups([cooling], 'east', 'parent', categories, 15)[0].state, 'cooldown')
  assert.equal(pointGroups([cooling], 'elsewhere', '', categories, 15).length, 0)
  assert.equal(pointGroups([cooling], '', 'other', categories, 15).length, 0)
  assert.equal(pointGroups([{ ...cooling, task: { ...task, completedCount: 1 } }], '', '', [], 15)[0].state, 'completed')
  assert.equal(pointGroups([{ ...cooling, reason: 'error.patrol.execution.unassigned' }], '', '', [], 15)[0].state, 'unavailable')
  assert.equal(pointGroups([cooling, { ...cooling, executable: true }], '', '', [], 15)[0].state, 'ready')
})

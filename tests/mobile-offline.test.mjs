import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const compiled = await build({ stdin: { contents: `export * from './mobile/offline/model'; export * from './mobile/offline/sync'`, resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'cjs' })
const module = { exports: {} }
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const { offlineKey, emptyOfflineData, collectReason, queueEntry, syncEntry } = module.exports
const row = () => ({ executable: true, reason: '', task: { id: 'task', pointId: 'point', projectId: 'project', startTime: 100, endTime: 1000, requiredCount: 2, completedCount: 0, cooldownMinutes: 1, standardSnapshot: [
  { id: 'text', title: 'Inspection', type: 'text', required: true, options: [] },
  { id: 'photo', title: 'Photo', type: 'image', required: true, options: [] },
] } })
function entry() { return queueEntry(row(), [{ itemId: 'text', value: ' 真实检查 ' }, { itemId: 'photo', attachmentId: 'local-photo' }], ' 备注 ', { 'local-photo': { blob: new Blob(['png'], { type: 'image/png' }), name: 'photo.png' } }, 'same-request', 500) }
function memory(initial) {
  let data = structuredClone(initial)
  return { read: async () => structuredClone(data), update: async change => { const next = structuredClone(data); change(next); data = next; return structuredClone(data) } }
}

test('离线工作区按应用、员工、项目隔离，不存令牌', () => {
  const identity = { applicationId: 'app', userId: 'alice', projectId: 'project' }
  const key = offlineKey(identity)
  for (const patch of [{ applicationId: 'other' }, { userId: 'bob' }, { projectId: 'other-project' }]) assert.notEqual(offlineKey({ ...identity, ...patch }), key)
  assert.throws(() => offlineKey({ ...identity, projectId: '' }), /offlineIdentityRequired/)
  assert.equal(key.includes('token'), false)
})
test('本机记录保存标准快照、原始图片和离线采集时间，缺图或必填拒绝', async () => {
  const saved = entry()
  assert.equal(saved.submission.networkStatus, 'offline'); assert.equal(saved.submission.collectedTime, 500)
  assert.equal(saved.submission.requestId, 'same-request'); assert.equal(saved.submission.answers[0].value, '真实检查')
  assert.equal(await saved.photos['local-photo'].blob.text(), 'png')
  assert.throws(() => queueEntry(row(), [], '', {}, 'r', 500), /offlineIncomplete/)
  assert.throws(() => queueEntry(row(), saved.submission.answers, '', {}, 'r', 500), /offlinePhotoMissing/)
  const source = row(), snapshot = queueEntry(source, saved.submission.answers, '', saved.photos, 'r', 500)
  source.task.standardSnapshot[0].title = 'Changed'; assert.equal(snapshot.row.task.standardSnapshot[0].title, 'Inspection')
})
test('缓存不伪装完成，重复待同步、过期、冷却、无执行资格均不可新采集', () => {
  const data = emptyOfflineData(), task = row()
  assert.equal(collectReason(task, data, 500), '')
  for (const now of [99, 1000]) assert.equal(collectReason(task, data, now), 'Mobile.outsideWindow')
  assert.equal(collectReason({ ...task, executable: false, reason: 'error.patrol.execution.unassigned' }, data, 500), 'Mobile.unavailable')
  assert.equal(collectReason({ ...task, task: { ...task.task, lastExecutionTime: 100 } }, data, 500), 'Mobile.cooldown')
  data.entries.push(entry()); assert.equal(collectReason(task, data, 500), 'Mobile.offlineAlreadyQueued')
  data.entries[0].state = 'synced'; data.entries[0].record = { receiveTime: 700 }
  assert.equal(collectReason(task, data, 750), 'Mobile.offlineRefreshRequired')
  data.cachedAt = 800; data.entries[0].cacheTime = 800
  assert.equal(collectReason(task, data, 850), 'Mobile.offlineRefreshRequired')
})
test('上传回执与最终请求先保存，提交响应丢失后重试同一请求，不重复上传图片', async () => {
  const data = emptyOfflineData(); data.entries.push(entry()); const store = memory(data)
  let uploads = 0, checks = 0; const submissions = []
  const api = { upload: async file => { uploads++; assert.equal(await file.text(), 'png'); return { id: 'server-photo' } }, submit: async body => {
    const saved = (await store.read()).entries[0]
    assert.deepEqual(saved.payload, body); submissions.push(structuredClone(body))
    if (submissions.length === 1) throw new Error('response lost')
    return { id: 'record', taskId: 'task', receiveTime: 700 }
  } }
  const identity = async () => { checks++ }
  await assert.rejects(syncEntry(store, 'same-request', 'project', api, identity), /response lost/)
  let saved = (await store.read()).entries[0]; assert.equal(saved.state, 'failed'); assert.equal(saved.error, 'response lost')
  assert.equal(saved.receipts['local-photo'], 'server-photo'); assert.equal(await saved.photos['local-photo'].blob.text(), 'png')
  await syncEntry(store, 'same-request', 'project', api, identity)
  saved = (await store.read()).entries[0]; assert.equal(saved.state, 'synced'); assert.equal(saved.record.id, 'record')
  assert.equal(uploads, 1); assert.deepEqual(submissions[0], submissions[1]); assert.equal(submissions[1].collectedTime, 500)
  assert.equal(submissions[1].answers[1].attachmentId, 'server-photo'); assert.ok(checks >= 3)
  await syncEntry(store, 'same-request', 'project', api, identity); assert.equal(submissions.length, 2)
})
test('切换身份时禁止上传和提交；服务器的权限或时段拒绝保留本机内容', async () => {
  const data = emptyOfflineData(); data.entries.push(entry()); const store = memory(data); let calls = 0
  const api = { upload: async () => { calls++; return { id: 'server-photo' } }, submit: async () => { calls++; throw new Error('error.patrol.execution.outside_window') } }
  await assert.rejects(syncEntry(store, 'same-request', 'project', api, async () => { throw new Error('Mobile.contextChanged') }), /contextChanged/)
  assert.equal(calls, 0)
  await assert.rejects(syncEntry(store, 'same-request', 'project', api, async () => {}), /outside_window/)
  const saved = (await store.read()).entries[0]; assert.equal(saved.state, 'failed'); assert.equal(saved.error, 'error.patrol.execution.outside_window')
  assert.equal(saved.submission.requestId, 'same-request'); assert.equal(await saved.photos['local-photo'].blob.text(), 'png')
})

test('传输层在发送前绑定离线记录的原员工、应用和项目，拒绝串号发送', async () => {
  const result = await build({ stdin: { contents: `export {request} from './mobile/transport';export {patrolProject} from './mobile/projectScope'`, resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'cjs', external: ['vue'], plugins: [{ name: 'session-boundary', setup(builder) {
    builder.onResolve({ filter: /auth\/session$/ }, () => ({ path: 'session', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const authState=globalThis.__offlineTransport.auth;export const verifySession=async()=>authState.authorization;export const sessionRequest=async(...args)=>{globalThis.__offlineTransport.calls.push(args);return {accepted:true}}` }))
  } }] })
  const originalWindow = globalThis.window
  globalThis.window = {}
  const fixture = globalThis.__offlineTransport = { calls: [], auth: { session: { applicationId: 'app' }, authorization: { user: { id: 'alice' } } } }
  try {
    const module = { exports: {} }
    new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
    const { request, patrolProject } = module.exports
    patrolProject.value = 'project'
    const send = expected => request('/park/patrol/executions', 'POST', { requestId: 'original' }, 'project', expected)
    const identity = { applicationId: 'app', userId: 'alice' }
    await send(identity); assert.equal(fixture.calls.length, 1)
    fixture.auth.authorization.user.id = 'bob'
    await assert.rejects(send(identity), /Mobile.contextChanged/)
    fixture.auth.authorization.user.id = 'alice'; fixture.auth.session.applicationId = 'other-app'
    await assert.rejects(send(identity), /Mobile.contextChanged/)
    fixture.auth.session.applicationId = 'app'; patrolProject.value = 'other-project'
    await assert.rejects(send(identity), /Mobile.contextChanged/)
    assert.equal(fixture.calls.length, 1)
  } finally {
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow
    delete globalThis.__offlineTransport
  }
})

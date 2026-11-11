import test from 'node:test'
import assert from 'node:assert/strict'
import { homeSummary, homeTasks } from '../mobile/home.ts'
import { pointGroups } from '../mobile/points.ts'
import { canManage, pointPayload, pointQuery, rulesValid } from '../mobile/management/model.ts'
import { historyQuery } from '../mobile/history.ts'

test('小程序首页按时段及角色计数，已结束的当日完成任务保留，跨天归属不混算', () => {
  const row = (id, extra = {}, executable = false, reason = '') => ({ task: {
    id, pointId: 'same-point', businessDate: '2026-11-06', startTime: 10, endTime: 20,
    requiredCount: 2, completedCount: 0, ...extra,
  }, executable, reason })
  assert.deepEqual(homeSummary([
    row('role-a', {}, true), row('role-b', {}, true),
    row('cooling', {}, false, 'error.patrol.execution.cooldown'),
    row('expired-completed', { startTime: 0, endTime: 10, completedCount: 2 }),
    row('yesterday', { belongDate: '2026-11-05', completedCount: 2 }),
    row('future', { startTime: 20, endTime: 30 }, true),
    row('unassigned', {}, false, 'error.patrol.execution.unassigned'),
  ], '2026-11-06', 15), { ready: 2, cooldown: 1, completed: 1 })
})

test('首页各状态统计匹配任务，今日完成筛选包含已结束时段且可查看点位详情', () => {
  const row = (id, endTime, completedCount, executable, reason = '') => ({
    task: { id, pointId: id, pointName: id, businessDate: '2026-11-06', startTime: 0, endTime, requiredCount: 2, completedCount }, executable, reason,
  })
  const rows = [row('ready', 20, 0, true), row('cooling', 20, 1, false, 'error.patrol.execution.cooldown'),
    row('done', 10, 2, false), row('expired', 10, 1, false)]
  const summary = homeSummary(rows, '2026-11-06', 15)
  for (const state of ['ready', 'cooldown', 'completed']) {
    const filtered = homeTasks(rows, '2026-11-06', 15, state)
    assert.equal(filtered.length, summary[state])
    const points = pointGroups(filtered, '', '', [], 15, state === 'completed')
    assert.equal(points.length, 1)
    assert.equal(points[0].state, state)
    assert.equal(points[0].rows.length, 1)
  }
  assert.deepEqual(homeTasks(rows, '2026-11-07', 15, 'completed'), [])
  assert.equal(pointGroups(rows, '', '', [], 15).some(point => point.id === 'done'), false)
})

test('管理按钮按独立功能权限展示，查询权限和员工身份不能冒充保存权限', () => {
  assert.equal(canManage({ userId: 'employee', permissions: [{ id: 'patrol-point', actions: ['query'] }] }, 'patrol-point', 'save'), false)
  assert.equal(canManage({ permissions: [{ id: 'patrol-point', actions: ['save'] }] }, 'patrol-point', 'save'), true)
  assert.equal(canManage({ permissions: [{ id: 'patrol-point', actions: ['save'] }] }, 'patrol-plan', 'save'), false)
  assert.equal(canManage(undefined, 'patrol-point', 'save'), false)
  assert.equal(canManage({ permissions: [{ id: '*', actions: ['*'] }] }, 'patrol-point', 'save'), true)
})

test('点位编辑保留NFC及原分类，不将项目名、审计信息或执行角色写入点位字段', () => {
  const source = { id: 'point', name: ' East gate ', code: ' ', projectId: 'project', projectName: 'Project', categoryId: 'original',
    categoryIds: ['original', 'linked'], tagIds: ['tag'], enabled: true, nfcCode: 'unchanged', createTime: 1, userIds: ['u'], description: 'notes' }
  const payload = pointPayload(source)
  source.tagIds.push('later')
  assert.deepEqual(payload, { id: 'point', name: 'East gate', code: '', projectId: 'project', categoryId: 'original',
    tagIds: ['tag'], enabled: true, nfcCode: 'unchanged', location: undefined, description: 'notes' })
})

test('分类筛选复用PC公开的关联分类条件，并由后端注入项目及资产范围', () => {
  const query = pointQuery(' Gate ', 'category', 2)
  assert.equal(query.pageIndex, 2)
  assert.deepEqual(query.terms, [{ column: 'name', termType: 'like', value: '%Gate%' }, { column: 'categoryId', termType: 'eq', value: 'category' }])
  assert.deepEqual(pointQuery('  ', '').terms, [])
})

test('巡更配置允许仅保存角色及全员任务，等级标准成对填写且角色不重复', () => {
  assert.equal(rulesValid([{ roleId: '' }, { roleId: 'role' }]), true)
  assert.equal(rulesValid([{ roleId: '', levelId: 'level', standardId: 'standard' }]), true)
  assert.equal(rulesValid([{ roleId: 'role', levelId: 'level' }]), false)
  assert.equal(rulesValid([{ roleId: '' }, { roleId: '' }]), false)
  assert.equal(rulesValid([]), true)
})

test('项目历史人员筛选使用员工ID，继续保留时间条件和服务端分页', () => {
  const query = historyQuery({ from: '2026-11-06', to: '2026-11-06', categoryId: '', levelId: '', pointName: '', userId: 'staff-id' }, 1)
  assert.deepEqual(query.terms.at(-1), { column: 'userId', termType: 'eq', value: 'staff-id' })
  assert.equal(query.pageIndex, 1)
  assert.equal(query.pageSize, 20)
})

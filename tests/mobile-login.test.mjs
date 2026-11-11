import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const directory = fileURLToPath(new URL('..', import.meta.url))
const bundle = await build({
  stdin: { contents: `export * from './mobile/auth/session.ts'; export * from './mobile/auth/useLogin.ts'; export * from './mobile/auth/useLoginVerification.ts'; export { patrolProject } from './mobile/projectScope.ts'`, resolveDir: directory },
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['vue'],
  define: { 'import.meta.env.BASE_URL': JSON.stringify('/patrol-h5/') },
  plugins: [{ name: 'rsa-contract', setup(builder) {
    builder.onResolve({ filter: /^jsencrypt$/ }, () => ({ path: 'rsa', namespace: 'test' }))
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `export default class RSA { setPublicKey(key) { globalThis.rsaKey = key } encrypt(value) { return globalThis.rsaResult === false ? false : 'encrypted:' + value } }` }))
  } }],
})
const config = { title: '智能巡更', apiBase: '/api' }
const authorization = { user: { id: 'employee', name: '巡更员工' }, permissions: [{ id: 'patrol-task', actions: ['query'] }] }
const ok = result => ({ ok: true, status: 200, json: async () => ({ status: 200, result }) })
const failed = status => ({ ok: false, status, json: async () => ({ status, message: 'denied' }) })

async function fixture(run) {
  const previous = Object.fromEntries(['location', 'sessionStorage', 'fetch', 'rsaKey', 'rsaResult'].map(key => [key, globalThis[key]]))
  const stored = new Map(), calls = []
  globalThis.location = { origin: 'http://localhost:9300', search: '?applicationScope=patrol-app' }
  globalThis.sessionStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) }
  let respond = (url) => {
    if (url === '/patrol-h5/config.json') return { ok: true, json: async () => config }
    if (url.endsWith('/captcha/config')) return ok({ enabled: true, type: 'image' })
    if (url.includes('/captcha/image')) return ok({ base64: 'data:image/png;base64,image', key: 'captcha-key' })
    if (url.endsWith('/login/configs')) return ok({ encrypt: { enabled: true, id: 'encrypt-id', publicKey: 'public-key' } })
    if (url.endsWith('/authorize/login')) return ok({ token: 'h5-token' })
    if (url.endsWith('/authorize/me')) return ok(authorization)
    return ok([])
  }
  globalThis.fetch = async (url, options) => { calls.push({ url, options });
    return respond(url, options) }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
  try { await run({ ...module.exports, stored, calls, respond: handler => { respond = handler } }) }
  finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value } }
}

async function waitFor(check) {
  for (let count = 0; count < 30; count++) { if (check()) return; await new Promise(resolve => setImmediate(resolve)) }
  assert.fail('expected login verification state')
}

test('H5应用登录：原样提交账号，公开认证不携带PC上下文，RSA后核验应用并收窄业务项目', () => fixture(async vm => {
  await vm.initializeConfig()
  const login = vm.useLogin()
  Object.assign(login.form, { username: 'test2', password: 'secret' })
  const attempt = login.login()
  await waitFor(() => login.verification.value)
  assert.equal(vm.authState.session, undefined)
  assert.equal(vm.stored.size, 0)
  login.completeVerification({ verifyKey: 'captcha-key', verifyCode: '1234' })
  assert.equal(await attempt, true)
  const request = vm.calls.find(call => call.url.endsWith('/authorize/login')).options
  assert.deepEqual(request.headers, { 'Content-Type': 'application/json' })
  assert.deepEqual(JSON.parse(request.body), { username: 'test2', password: 'encrypted:secret', verifyKey: 'captcha-key', verifyCode: '1234', expires: 3600000, encryptId: 'encrypt-id' })
  assert.equal(globalThis.rsaKey, 'public-key')
  assert.equal(vm.authState.authorization.user.id, 'employee')
  assert.equal(login.form.password, '')
  await vm.sessionRequest('/park/patrol/mobile/tasks/_query', 'POST', { date: '2026-11-06' }, { projectId: 'project-a' })
  assert.deepEqual(vm.calls.at(-1).options.headers, { 'X-Access-Token': 'h5-token', 'X-Asset-Scope': 'business_application:patrol-app', 'X-Patrol-Project': 'project-a', 'Content-Type': 'application/json' })
  assert.equal(vm.calls.at(-1).options.credentials, 'omit')
}))

test('同一构建刷新恢复应用会话，忽略部署配置的历史应用ID，清理时重置项目', () => fixture(async vm => {
  await vm.initializeConfig()
  vm.setSession({ token: 'saved-token', applicationId: 'patrol-app' })
  vm.patrolProject.value = 'old-project'
  await vm.initializeConfig()
  assert.equal(vm.authState.session.token, 'saved-token')
  assert.equal(vm.patrolProject.value, undefined)
  assert.equal(vm.authState.authorization, undefined)
  vm.respond(() => ({ ok: true, json: async () => ({ ...config, applicationId: 'other-app' }) }))
  await vm.initializeConfig()
  assert.equal(vm.authState.session.applicationId, 'patrol-app')
  vm.clearSession()
  assert.equal(vm.patrolProject.value, undefined)
  assert.equal(vm.stored.size, 0)
}))

test('401回登录、403保留会话；旧请求不能删除或返回新账号的数据', () => fixture(async vm => {
  await vm.initializeConfig()
  const session = token => ({ token, applicationId: 'patrol-app' })
  vm.setSession(session('old'))
  vm.respond(() => failed(403))
  await assert.rejects(vm.sessionRequest('/park/patrol/mobile/tasks/_query'), error => error.status === 403)
  assert.equal(vm.authState.session.token, 'old')
  let complete
  vm.respond(() => new Promise(resolve => { complete = resolve }))
  const late = vm.sessionRequest('/park/patrol/mobile/tasks/_query')
  vm.setSession(session('new'))
  complete(failed(401))
  await assert.rejects(late, error => error.message === 'Mobile.contextChanged')
  assert.equal(vm.authState.session.token, 'new')
  vm.respond(() => failed(401))
  await assert.rejects(vm.sessionRequest('/park/patrol/mobile/tasks/_query'), error => error.status === 401)
  assert.equal(vm.authState.session, undefined)
  assert.equal(vm.stored.size, 0)
}))

test('加密失败不明文降级，成员缺少业务权限仍可登录应用并保留实际授权', () => fixture(async vm => {
  await vm.initializeConfig()
  const login = vm.useLogin()
  Object.assign(login.form, { username: 'test2@CQHT', password: 'secret' })
  globalThis.rsaResult = false
  assert.equal(await login.login(), false)
  assert.equal(vm.calls.some(call => call.url.endsWith('/authorize/login')), false)
  assert.equal(login.error.value, 'Mobile.passwordEncryptFailed')
  globalThis.rsaResult = true
  vm.respond(url => url.endsWith('/authorize/me') ? ok({ user: { id: 'admin' }, permissions: [] })
    : url.endsWith('/authorize/login') ? ok({ token: 'token' })
      : url.endsWith('/captcha/config') ? ok({ enabled: false }) : ok({}))
  assert.equal(await login.login(), true)
  assert.deepEqual(vm.authState.authorization, {user:{id:'admin'},permissions:[]})
  assert.equal(vm.authState.session.applicationId, 'patrol-app')
}))

test('拒绝跨域API及错误应用入口，退出失败仍清理本地登录', () => fixture(async vm => {
  vm.respond(() => ({ ok: true, json: async () => ({ ...config, apiBase: '//other.example/api' }) }))
  await assert.rejects(vm.initializeConfig(), error => error.message === 'Mobile.sameOriginRequired')
  vm.respond(() => ({ ok: true, json: async () => config }))
  globalThis.location.search = '?applicationScope=invalid%2Fapp'
  await assert.rejects(vm.initializeConfig(), error => error.message === 'Mobile.applicationMismatch')
  globalThis.location.search = '?applicationScope=patrol-app'
  await vm.initializeConfig()
  vm.setSession({ token: 'token', applicationId: 'patrol-app' })
  vm.respond(() => failed(503))
  await assert.rejects(vm.logout())
  assert.equal(vm.authState.session, undefined)
  assert.equal(vm.stored.size, 0)
  assert.equal(vm.calls.at(-1).options.method, 'GET')
}))

test('新版挑战验证：首次403只弹验证，重试携带确认头，授权完成前不存储凭证', () => fixture(async vm => {
  await vm.initializeConfig()
  const login = vm.useLogin()
  Object.assign(login.form, { username: 'plain-app-user', password: 'secret' })
  let attempts = 0
  vm.respond((url, options) => {
    if (url.endsWith('/login/configs')) return ok({})
    if (url.endsWith('/captcha/config')) return ok({ enabled: true, type: 'image', loginWithVerify: true })
    if (url.endsWith('/authorize/login')) {
      attempts++
      return attempts === 1 ? { ok: false, status: 403, json: async () => ({ status: 403, result: { type: 'captcha', key: 'challenge' } }) } : ok({ token: 'verified-token' })
    }
    if (url.endsWith('/authorize/me')) {
      assert.equal(vm.stored.size, 0)
      assert.equal(vm.authState.session, undefined)
      assert.equal(options.headers['X-Access-Token'], 'verified-token')
      return ok(authorization)
    }
    return ok({})
  })
  const result = login.login()
  await waitFor(() => login.verification.value)
  assert.equal(login.verification.value.key, 'challenge')
  assert.equal(attempts, 1)
  login.completeVerification({ verification: { key: 'challenge', token: 'confirmed' } })
  assert.equal(await result, true)
  const requests = vm.calls.filter(call => call.url.endsWith('/authorize/login'))
  assert.deepEqual(JSON.parse(requests[1].options.body), JSON.parse(requests[0].options.body))
  assert.equal(requests[1].options.headers['x-verify-key'], 'challenge')
  assert.equal(requests[1].options.headers['x-verify-token'], 'confirmed')
  assert.equal(vm.authState.session.token, 'verified-token')
}))

test('取消安全验证、修改登录输入及重复点击不会创建迟到会话', () => fixture(async vm => {
  await vm.initializeConfig()
  const login = vm.useLogin()
  Object.assign(login.form, { username: 'app-user', password: 'secret' })
  let attempt = login.login()
  await waitFor(() => login.verification.value)
  assert.equal(await login.login(), false)
  login.cancelVerification()
  assert.equal(await attempt, false)
  assert.equal(login.error.value, 'Mobile.loginCancelled')
  assert.equal(vm.calls.some(call => call.url.endsWith('/authorize/login')), false)
  attempt = login.login()
  await waitFor(() => login.verification.value)
  login.form.username = 'other-user'
  login.completeVerification({ verifyKey: 'old', verifyCode: 'old' })
  assert.equal(await attempt, false)
  assert.equal(vm.stored.size, 0)
  vm.respond(url => url.endsWith('/login/configs') ? ok({}) : url.endsWith('/captcha/config') ? ok({ enabled: false })
    : url.endsWith('/authorize/login') ? new Promise(resolve => { globalThis.finishPatrolLogin = resolve }) : ok(authorization))
  attempt = login.login()
  await waitFor(() => globalThis.finishPatrolLogin)
  login.form.password = 'changed'
  globalThis.finishPatrolLogin(ok({ token: 'late' }))
  delete globalThis.finishPatrolLogin
  assert.equal(await attempt, false)
  assert.equal(vm.authState.session, undefined)
  assert.equal(vm.stored.size, 0)
}))

test('应用入口登录不需要项目编码，会话可恢复，ALTCHA绑定登录账号上下文', () => fixture(async vm => {
  vm.respond(() => ({ ok: true, json: async () => ({ ...config, tenantDomain: 'OLD_DOMAIN' }) }))
  await vm.initializeConfig()
  const login = vm.useLogin()
  assert.equal('tenantDomain' in login.form, false)
  Object.assign(login.form, { username: 'plain-user', password: 'secret' })
  vm.respond(url => url.endsWith('/login/configs') ? ok({}) : url.endsWith('/captcha/config')
    ? ok({ enabled: true, type: 'altcha', loginWithVerify: false, altcha: { contextUrl: '/captcha/context' } })
    : url.endsWith('/captcha/context') ? ok({ contextToken: 'context' }) : url.endsWith('/authorize/login') ? ok({ token: 'altcha-token' }) : ok(authorization))
  const attempt = login.login()
  await waitFor(() => login.verification.value)
  assert.equal(login.verification.value.contextToken, 'context')
  assert.deepEqual(JSON.parse(vm.calls.find(call => call.url.endsWith('/captcha/context')).options.body), { operation: 'login.captcha', target: 'plain-user' })
  login.completeVerification({ proof: 'proof', contextToken: 'context' })
  assert.equal(await attempt, true)
  const body = JSON.parse(vm.calls.find(call => call.url.endsWith('/authorize/login')).options.body)
  assert.equal(body.proof, 'proof')
  assert.equal(body.contextToken, 'context')
  vm.respond(() => ({ ok: true, json: async () => ({ ...config, tenantDomain: 'OLD_DOMAIN' }) }))
  await vm.initializeConfig()
  assert.deepEqual(vm.authState.session, { token: 'altcha-token', applicationId: 'patrol-app' })
  assert.equal(vm.calls.some(call => call.options?.headers?.['X-Tenant-Domain']), false)
}))

test('验证弹窗使用真实验证接口交换确认凭证，并拒绝过期ALTCHA证明', () => fixture(async vm => {
  const { effectScope } = createRequire(import.meta.url)('vue')
  await vm.initializeConfig()
  const scope = effectScope(), results = []
  const image = scope.run(() => vm.useLoginVerification({ key: 'challenge', config: { enabled: true, type: 'image' } }, result => results.push(result)))
  try {
    await image.load(async () => {})
    image.imageCode.value = ' 1234 '
    vm.respond(url => url.endsWith('/_confirm') ? ok({ token: 'confirmed' }) : ok({}))
    await image.confirmImage()
    assert.deepEqual(results, [{ verification: { key: 'challenge', token: 'confirmed' } }])
    const confirm = vm.calls.at(-1)
    assert.equal(confirm.url, '/api/verify/captcha/_confirm')
    assert.deepEqual(JSON.parse(confirm.options.body), { key: 'challenge', provider: 'image', params: { verifyKey: 'captcha-key', verifyCode: '1234' } })
    assert.equal(confirm.options.headers['X-Access-Token'], undefined)
  } finally { scope.stop() }
  const altchaScope = effectScope()
  const altcha = altchaScope.run(() => vm.useLoginVerification({ contextToken: 'context', config: { enabled: true, type: 'altcha', altcha: { challengeUrl: '/challenge', prevalidateUrl: '/prevalidate' } } }, result => results.push(result)))
  try {
    vm.respond(url => url.endsWith('/prevalidate') ? ok({ proof: 'expired', expiresAt: Date.now() - 1 }) : ok({ challenge: 'challenge' }))
    let configured
    await altcha.load(async challenge => { configured = challenge })
    assert.deepEqual(configured, { challenge: 'challenge' })
    await altcha.verified('payload')
    assert.equal(altcha.error.value, 'Mobile.verificationExpired')
    assert.equal(results.length, 1)
    vm.respond(() => ok({ proof: 'valid', expiresAt: Date.now() + 10000 }))
    await altcha.verified('payload')
    assert.deepEqual(results.at(-1), { proof: 'valid', contextToken: 'context' })
  } finally { altchaScope.stop() }
}))

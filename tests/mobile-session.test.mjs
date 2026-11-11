import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveBrowserSession } from '../mobile/browserSession.ts'
import { pendingStore } from '../mobile/pending.ts'
const origin = 'http://localhost:9300'

test('platform application uses existing SaaS login without inventing a tenant or project', () => {
  const session = resolveBrowserSession('', 'patrol', null, 'existing-session', origin)
  assert.equal(session.token, 'existing-session')
  assert.equal(session.domain, undefined)
  assert.deepEqual(session.project, {})
  assert.equal(session.api, '/api')
})

test('explicit project never falls back to a different platform login', () => {
  for (const raw of [null, '{}', 'null', '[]', 'invalid', '{"token":12}'])
    assert.throws(() => resolveBrowserSession('park', 'patrol', raw, 'platform-admin', origin),
      error => error.status === 401)
  const session = resolveBrowserSession('park', 'patrol', JSON.stringify({ token:'member', domain:'park-domain', id:'park-id' }), 'platform-admin', origin)
  assert.equal(session.token, 'member')
  assert.equal(session.domain, 'park-domain')
})

test('mobile session rejects credential forwarding to another origin and an application ID used as domain', () => {
  assert.throws(() => resolveBrowserSession('park', 'patrol', JSON.stringify({ token:'member', apiUrl:'https://other.example/api' }), '', origin), error => error.status === 400)
  assert.equal(resolveBrowserSession('park', 'patrol', JSON.stringify({ token:'member', domain:'patrol' }), '', origin).domain, undefined)
  assert.throws(() => resolveBrowserSession('', '', null, 'member', origin), error => error.status === 401)
})

test('pending platform submissions stay isolated by application and user without a project', () => {
  const map = new Map(), store = pendingStore({getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)})
  const context = {applicationId:'patrol',userId:'alice'}
  const attempt = {row:{task:{id:'period'}},submission:{taskId:'period',requestId:'request',answers:[]}}
  store.write(context,attempt)
  assert.deepEqual(store.read(context),attempt)
  for(const change of [{applicationId:'other'},{userId:'bob'},{projectId:'park'}])
    assert.equal(store.read({...context,...change}),undefined)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const output = await build({ stdin: { contents: "export * from './mobile/auth/session.ts'; export { patrolProject } from './mobile/projectScope.ts'", resolveDir: fileURLToPath(new URL('..', import.meta.url)) }, bundle:true, write:false, platform:'node',format:'cjs',external:['vue'],define:{'import.meta.env.BASE_URL':JSON.stringify('/patrol-h5/')} })
const ok = result => ({ok:true,status:200,json:async()=>({status:200,result})})
const me = {user:{id:'employee'},permissions:[{id:'patrol-task',actions:['query']}]}
async function fixture(run) {
  const before=Object.fromEntries(['fetch','sessionStorage','location'].map(key=>[key,globalThis[key]])), storage=new Map(), calls=[]
  globalThis.location={origin:'http://localhost:9300',search:'?applicationScope=selected-app'}
  globalThis.sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}
  let respond=url=>url.endsWith('config.json')?{ok:true,json:async()=>({title:'巡更',apiBase:'/api'})}:ok(me)
  globalThis.fetch=async(url,options)=> { calls.push({url,options}); return respond(url,options) }
  const module={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports)
  const vm=module.exports, account={token:'account-token',applicationId:'old-app',tenantDomain:'DOMAIN'}
  vm.setSession(account)
  try {await run({...vm,account,calls,storage,respond:handler=>{respond=handler}})}
  finally {for(const [key,value] of Object.entries(before)) {if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
}

test('指定应用入口直接核验其Scope，不查询模板或应用列表，也不恢复旧应用',()=>fixture(async vm=>{
  await vm.initializeConfig();vm.patrolProject.value='old-project'
  await vm.restoreSession()
  assert.equal(vm.authState.session.applicationId,'selected-app')
  assert.equal(vm.authState.authorization.user.id,'employee')
  assert.equal(vm.patrolProject.value,undefined)
  assert.deepEqual(vm.calls.map(call=>call.url),['/patrol-h5/config.json','/api/authorize/me'])
  assert.equal(vm.calls.at(-1).options.headers['X-Asset-Scope'],'business_application:selected-app')
  assert.equal(vm.calls.at(-1).options.headers['X-Tenant-Domain'], undefined)
  assert.equal('tenantDomain' in vm.authState.session, false)
}))

test('裸入口即使存在旧会话也提示从具体应用打开，不猜测或默认进入',()=>fixture(async vm=>{
  globalThis.location.search=''
  await vm.initializeConfig()
  await assert.rejects(vm.restoreSession(),error=>error.message==='Mobile.applicationEntryRequired')
  assert.equal(vm.authState.authorization,undefined)
  assert.equal(vm.calls.length,1)
}))

test('成员缺少巡更业务权限仍可进入，保留实际授权供提示与操作展示',()=>fixture(async vm=>{
  vm.authState.requestedApplication='selected-app'
  vm.respond(()=>ok({user:me.user,permissions:[]}))
  await vm.restoreSession()
  assert.equal(vm.authState.session.applicationId,'selected-app')
  assert.deepEqual(vm.authState.authorization.permissions,[])
}))

test('平台拒绝应用Scope时不进入业务，也不尝试其他应用',()=>fixture(async vm=>{
  vm.authState.requestedApplication='nonmember-app'
  vm.respond(()=>({ok:false,status:403,json:async()=>({status:403,message:'member_denied'})}))
  await assert.rejects(vm.restoreSession(),error=>error.status===403)
  assert.equal(vm.authState.authorization,undefined)
  assert.equal(vm.calls.length,1)
}))

test('恢复期间切换账号，迟到授权不能覆盖新会话',()=>fixture(async vm=>{
  vm.authState.requestedApplication='selected-app'
  let finish;vm.respond(()=>new Promise(resolve=>{finish=resolve}))
  const restoring=vm.restoreSession()
  vm.setSession({...vm.account,token:'new-account'})
  finish(ok(me))
  await assert.rejects(restoring,error=>error.message==='Mobile.contextChanged')
  assert.equal(vm.authState.session.token,'new-account')
  assert.equal(vm.authState.authorization,undefined)
}))

test('初始化只接受格式正确的应用入口，不读取URL令牌或历史部署应用ID',()=>fixture(async vm=>{
  globalThis.location.search='?applicationScope=app-b&token=untrusted'
  await vm.initializeConfig()
  assert.equal(vm.requestedApplicationId(),'app-b')
  assert.equal(vm.authState.session.token,'account-token')
  globalThis.location.search='?applicationScope=bad%2Fid'
  await assert.rejects(vm.initializeConfig(),error=>error.message==='Mobile.applicationMismatch')
}))

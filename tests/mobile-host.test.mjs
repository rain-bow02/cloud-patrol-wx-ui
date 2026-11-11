import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const bundle = await build({stdin:{contents:"export * from './mobile/transport';export {patrolProject} from './mobile/projectScope'",resolveDir:fileURLToPath(new URL('..',import.meta.url))},bundle:true,write:false,platform:'node',format:'cjs',external:['vue'],define:{'import.meta.env.BASE_URL':JSON.stringify('/patrol-h5/')}})
async function fixture(run,{bridge=true}={}) {
  const before=Object.fromEntries(['window','fetch'].map(key=>[key,globalThis[key]]))
  let context={userId:'employee',applicationId:'selected-app',environmentId:'saas-project',permissions:[]},calls=[]
  let getContext=async()=>context,respond=async()=>({accepted:true})
  globalThis.window={location:{search:'?mode=app'},...(bridge?{patrolHost:{context:()=>getContext(),request:async(...args)=>{calls.push(args);return respond(...args)}}}:{})}
  globalThis.fetch=()=>{throw new Error('APP模式不得调用浏览器登录、模板或应用接口')}
  const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports)
  try {await run({...module.exports,calls,change:value=>{context={...context,...value}},getContext:handler=>{getContext=handler},respond:handler=>{respond=handler}})}
  finally {for(const [key,value] of Object.entries(before)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
}

test('APP初始化等待上下文，选中应用可无业务权限；SaaS项目不自动变成物业所属项目',()=>fixture(async vm=>{
  let finish;vm.getContext(()=>new Promise(resolve=>{finish=resolve}))
  const init=vm.initializeHost()
  assert.equal(vm.hostState.context,undefined)
  finish({userId:'employee',applicationId:'selected-app',environmentId:'saas-project',permissions:[]})
  await init
  assert.equal(vm.hostState.context.applicationId,'selected-app')
  assert.equal(vm.patrolProject.value,undefined)
  assert.equal(vm.calls.length,0)
}))

test('明确APP模式缺少宿主接口时提示返回APP，不掉入独立登录',()=>fixture(async vm=>{
  assert.equal(vm.hosted,true)
  await assert.rejects(vm.initializeHost(),/Mobile.hostUnavailable/)
  assert.equal(vm.hostState.error,'Mobile.hostUnavailable')
},{bridge:false}))

test('业务请求走宿主，保留当前物业项目、上传文件与预览结果',()=>fixture(async vm=>{
  await vm.initializeHost();vm.patrolProject.value='property-project'
  const body=new FormData();body.append('name','photo')
  const photo=new Blob(['image'],{type:'image/png'})
  vm.respond(async()=>photo)
  assert.equal(await vm.request('/park/patrol/attachments','POST',body),photo)
  assert.equal(vm.calls[0][2],body)
  assert.deepEqual(vm.calls[0][3],{projectId:'property-project'})
  await assert.rejects(vm.request('/authorize/login'),/Mobile.requestFailed/)
  assert.equal(vm.calls.length,1)
}))

test('账号、应用或环境变化后拒收旧请求结果并清理业务项目',()=>fixture(async vm=>{
  for(const changed of [{userId:'other-user'},{applicationId:'other-app'},{environmentId:'other-environment'}]) {
    await vm.initializeHost();vm.patrolProject.value='property-project'
    let finish;vm.respond(()=>new Promise(resolve=>{finish=resolve}))
    const pending=vm.request('/park/patrol/mobile/tasks/_query')
    while(!finish)await new Promise(resolve=>setImmediate(resolve))
    vm.change(changed);finish({oldData:true})
    await assert.rejects(pending,/Mobile.hostContextChanged/)
    assert.equal(vm.hostState.error,'Mobile.hostContextChanged')
    assert.equal(vm.patrolProject.value,undefined)
  }
}))

test('宿主401要求回APP登录；403只交给业务提示，不清掉上下文',()=>fixture(async vm=>{
  await vm.initializeHost()
  vm.respond(async()=>{throw new vm.MobileError(403,'denied')})
  await assert.rejects(vm.request('/park/patrol/mobile/tasks/_query'),/denied/)
  assert.equal(vm.hostState.error,undefined)
  vm.respond(async()=>{throw new vm.MobileError(401,'expired')})
  await assert.rejects(vm.request('/park/patrol/mobile/tasks/_query'),/Mobile.hostSessionRequired/)
  assert.equal(vm.hostState.error,'Mobile.hostSessionRequired')
}))

test('显式重新加载后，旧页面请求不能污染新上下文或返回旧数据',()=>fixture(async vm=>{
  await vm.initializeHost()
  let finish;vm.respond(()=>new Promise(resolve=>{finish=resolve}))
  const pending=vm.request('/park/patrol/mobile/tasks/_query')
  while(!finish)await new Promise(resolve=>setImmediate(resolve))
  vm.change({applicationId:'new-app'})
  await vm.initializeHost()
  finish({oldData:true})
  await assert.rejects(pending,/Mobile.contextChanged/)
  assert.equal(vm.hostState.context.applicationId,'new-app')
  assert.equal(vm.hostState.error,undefined)
}))

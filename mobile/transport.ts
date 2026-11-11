import { patrolProject } from './projectScope'
import { reactive } from 'vue'
import { MobileError } from './browserSession'
import { authState, sessionRequest, verifySession } from './auth/session'
export { MobileError } from './browserSession'
export type PatrolMethod = 'GET' | 'POST' | 'PUT'
export interface MobileContext {
  userId: string; projectId?: string; applicationId: string; name?: string
  /** 宿主可提供访问环境标识，仅用于切换检测；不是物业业务项目 ID。 */
  environmentId?: string
  /** 仅控制管理入口的展示；写入和执行资格仍由后端分别校验。 */
  permissions?: { id: string; actions: string[] }[]
}
/** 巡更 H5 的宿主适配契约；由接入方对接真实 APP Bridge，不假定初版 APP 已实现。 */
export interface PatrolHost {
  /** 返回当前账号和具体应用；Promise 可等待 APP 完成上下文准备。 */
  context(): Promise<MobileContext>
  /** 由宿主绑定当前认证与应用 Scope；FormData 原样上传，返回已解包的业务结果，失败抛 MobileError。 */
  request<T>(path: string, method: PatrolMethod, body?: unknown, options?: { projectId?: string }): Promise<T>
  /** 可选：H5 首页返回时交给宿主关闭 WebView；不是平台已存在的 Bridge 名称。 */
  back?(): void
}
declare global { interface Window { patrolHost?: PatrolHost } }

// mode=app 明确要求宿主上下文，缺少 Bridge 时显示错误，不能退回浏览器登录。
export const hosted = !!window.patrolHost || new URLSearchParams(window.location?.search || '').get('mode') === 'app'
export const hostState = reactive<{ context?: MobileContext; error?: string }>({})

export const host: PatrolHost = {
  async context() {
    if (hosted) {
      if (!window.patrolHost) throw new MobileError(503, 'Mobile.hostUnavailable')
      return window.patrolHost.context()
    }
    const me = authState.authorization || await verifySession()
    const session = authState.session
    if (!session) throw new MobileError(401, 'Mobile.sessionRequired')
    return { userId: me.user.id, applicationId: session.applicationId,
      name: me.user.name, permissions: me.permissions }
  },
  request: (path, method, body, options) => {
    if (hosted) {
      if (!window.patrolHost) return Promise.reject(new MobileError(503, 'Mobile.hostUnavailable'))
      return window.patrolHost.request(path, method, body, options)
    }
    return sessionRequest(path, method, body, options)
  },
  get back() { return window.patrolHost?.back?.bind(window.patrolHost) },
}
let contextIdentity = ''
let hostRevision = 0
function hostError(cause: unknown): Error {
  const message = cause instanceof Error ? cause.message : ''
  const status = cause instanceof MobileError ? cause.status : 0
  hostState.error = ['Mobile.hostUnavailable', 'Mobile.hostSessionRequired', 'Mobile.hostContextChanged', 'Mobile.hostContextFailed'].includes(message) ? message
    : status === 401 ? 'Mobile.hostSessionRequired'
      : message === 'Mobile.contextChanged' ? 'Mobile.hostContextChanged' : 'Mobile.hostContextFailed'
  patrolProject.value = undefined
  return new MobileError(status || 503, hostState.error)
}

/** 宿主上下文准备好才挂载业务页面；重试会卸载旧页面并清理旧业务项目。 */
export async function initializeHost() {
  hostRevision++
  contextIdentity = ''; hostState.context = undefined; hostState.error = undefined
  patrolProject.value = undefined
  if (!window.patrolHost) throw hostError(new MobileError(503, 'Mobile.hostUnavailable'))
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    hostState.context = await Promise.race([
      resolveContext(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Mobile.hostContextFailed')), 15000) }),
    ])
  } catch (cause) { throw hostError(cause) }
  finally { clearTimeout(timer) }
}

export async function resolveContext(): Promise<MobileContext> {
  if (hosted && hostState.error) throw new MobileError(401, hostState.error)
  const generation = hostRevision
  let context: MobileContext
  try { context = await host.context() }
  catch (cause) { throw hosted && generation === hostRevision ? hostError(cause) : cause }
  if (hosted && generation !== hostRevision) throw new MobileError(401, 'Mobile.contextChanged')
  if (hosted && hostState.error) throw new MobileError(401, hostState.error)
  if (!context || ![context.userId, context.applicationId].every(value => typeof value === 'string' && !!value.trim()))
    throw hosted ? hostError(new MobileError(401, 'Mobile.sessionRequired')) : new MobileError(401, 'Mobile.sessionRequired')
  const signature = JSON.stringify([context.environmentId, context.projectId, context.applicationId, context.userId])
  // 浏览器账号切换由登录壳卸载业务页面；APP Bridge 仍禁止运行中静默换身份。
  if (hosted && contextIdentity && contextIdentity !== signature) throw hostError(new Error('Mobile.contextChanged'))
  contextIdentity = signature
  return context
}
/** 仅允许巡更相对路径；写请求不做自动重试。 */
export async function request<T>(path: string, method: PatrolMethod = 'POST', body?: unknown, projectId: string | undefined = patrolProject.value,
  expected?: Pick<MobileContext, 'applicationId' | 'userId'>): Promise<T> {
  if (!path.startsWith('/park/patrol/') || path.includes('..') || path.includes('://'))
    return Promise.reject(new MobileError(400, 'Mobile.requestFailed'))
  const context = await resolveContext()
  const generation = hostRevision
  // 离线队列的重试绑定原身份；核验后立即调用传输，不能静默换账号或项目发送旧记录。
  if (expected && (context.applicationId !== expected.applicationId || context.userId !== expected.userId || patrolProject.value !== projectId))
    throw new MobileError(401, 'Mobile.contextChanged')
  try {
    const result = await host.request<T>(path, method, body, { projectId })
    if (hosted && generation !== hostRevision) throw new MobileError(401, 'Mobile.contextChanged')
    if (hosted) await resolveContext()
    return result
  } catch (cause) {
    if (hosted && generation === hostRevision && cause instanceof MobileError && cause.status === 401 && !hostState.error) throw hostError(cause)
    throw cause
  }
}

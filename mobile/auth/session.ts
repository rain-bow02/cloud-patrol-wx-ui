import { reactive } from 'vue'
import { MobileError } from '../browserSession'
import { patrolProject } from '../projectScope'

interface RuntimeConfig { title: string; apiBase: string }
export interface Session { token: string; applicationId: string }
export class VerificationRequired extends MobileError {
  constructor(public key: string) { super(403, 'Mobile.verificationRequired') }
}
export interface Authorization {
  user: { id: string; name?: string }
  permissions?: { id: string; actions: string[] }[]
}
const KEY = 'patrol-h5:session'
export const authState = reactive<{ config: RuntimeConfig; session?: Session; authorization?: Authorization; requestedApplication?: string }>({
  config: { title: '智能巡更', apiBase: '/api' },
})
let revision = 0

/** 运行配置和会话只属于巡更 H5；不读取 PC 的 localStorage 登录凭证。 */
export async function initializeConfig() {
  const response = await fetch(`${import.meta.env.BASE_URL}config.json`, { cache: 'no-store' })
  if (!response.ok) throw new MobileError(response.status, 'Mobile.loginConfigFailed')
  const config = await response.json() as RuntimeConfig
  const requestedApplication = new URLSearchParams(location.search).get('applicationScope') || undefined
  if (requestedApplication && !/^[a-zA-Z0-9_-]{1,128}$/.test(requestedApplication))
    throw new MobileError(400, 'Mobile.applicationMismatch')
  authState.requestedApplication = requestedApplication
  const api = typeof config.apiBase === 'string' ? config.apiBase : ''
  if (!api.startsWith('/') || api.startsWith('//') || /[\\?#]/.test(api)
    || new URL(api, location.origin).origin !== location.origin)
    throw new MobileError(400, 'Mobile.sameOriginRequired')
  authState.config = { title: config.title || '智能巡更', apiBase: api.replace(/\/$/, '') }
  clearSession(false)
  try {
    const stored = JSON.parse(sessionStorage.getItem(KEY) || 'null') as Session | null
    if (stored && typeof stored.token === 'string' && stored.token.trim()
      && typeof stored.applicationId === 'string' && stored.applicationId.trim())
      setSession(stored)
    else sessionStorage.removeItem(KEY)
  } catch { sessionStorage.removeItem(KEY) }
}

export function setSession(session: Session) {
  // 旧会话中的项目编码不再参与应用上下文，避免跨入口沿用错误租户头。
  session = { token: session.token, applicationId: session.applicationId }
  sessionStorage.setItem(KEY, JSON.stringify(session))
  revision++
  authState.authorization = undefined
  patrolProject.value = undefined
  authState.session = session
}
export function clearSession(removeStored = true) {
  revision++
  authState.session = undefined
  authState.authorization = undefined
  patrolProject.value = undefined
  if (removeStored) sessionStorage.removeItem(KEY)
}

/** 401 只清理发起请求的会话；旧账号的迟到响应不能清掉新登录。 */
export async function sessionRequest<T>(path: string, method = 'GET', body?: unknown,
  options: { scoped?: boolean; projectId?: string; session?: Session; signal?: AbortSignal; verification?: { key: string; token: string } } = {}): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//') || /[\\#]/.test(path))
    throw new MobileError(400, 'Mobile.sameOriginRequired')
  const scoped = options.scoped !== false, session = options.session || authState.session, requestRevision = revision
  if (scoped && (!session || !session.applicationId)) throw new MobileError(401, 'Mobile.sessionRequired')
  const headers: Record<string, string> = {}
  if (options.verification) {
    headers['x-verify-key'] = options.verification.key
    headers['x-verify-token'] = options.verification.token
  }
  if (session && (scoped || options.session)) headers['X-Access-Token'] = session.token
  if (scoped && session) {
    headers['X-Asset-Scope'] = `business_application:${session.applicationId}`
    if (options.projectId) headers['X-Patrol-Project'] = options.projectId
  }
  const multipart = body instanceof FormData
  if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json'
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000)
  const abort = () => controller.abort()
  if (options.signal?.aborted) controller.abort()
  else options.signal?.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetch(authState.config.apiBase + path, {
      method, headers, credentials: 'omit', signal: controller.signal,
      body: multipart ? body as FormData : body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await response.json().catch(() => null)
    if (controller.signal.aborted) throw new DOMException('Request aborted', 'AbortError')
    if ((scoped || options.session) && requestRevision !== revision) throw new MobileError(401, 'Mobile.contextChanged')
    const status = response.ok ? data?.status || response.status : response.status
    if (!response.ok || !data || status !== 200) {
      if (!scoped && status === 403 && data?.result?.type === 'captcha' && typeof data.result.key === 'string')
        throw new VerificationRequired(data.result.key)
      if (scoped && status === 401) clearSession()
      const accessDenied = status === 403 && path.startsWith('/park/patrol/mobile/')
      throw new MobileError(status, accessDenied ? 'Mobile.accessDenied'
        : status === 401 ? 'Mobile.sessionRequired' : data?.message || 'Mobile.requestFailed')
    }
    return data.result as T
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort) }
}

/** 获取当前应用授权；业务权限不足不等于没有应用成员资格，具体操作由后端校验。 */
export async function verifySession(session?: Session, signal?: AbortSignal) {
  const me = await sessionRequest<Authorization>('/authorize/me', 'GET', undefined, { session, signal })
  if (!me?.user?.id) throw new MobileError(401, 'Mobile.sessionRequired')
  if (!session) authState.authorization = me
  return me
}

/** 浏览器调试也必须从具体应用入口进入，不沿用旧应用或猜测唯一应用。 */
export function requestedApplicationId(): string {
  const id = authState.requestedApplication
  if (!id) throw new MobileError(400, 'Mobile.applicationEntryRequired')
  return id
}

/** 应用成员准入由平台激活 Scope 时校验；H5 不查询模板，也不自行按业务权限拒绝进入。 */
export async function restoreSession() {
  const id = requestedApplicationId(), session = authState.session
  if (!session) return
  const candidate = { ...session, applicationId: id }
  const authorization = await verifySession(candidate)
  if (authState.session !== session) throw new MobileError(401, 'Mobile.contextChanged')
  setSession(candidate)
  authState.authorization = authorization
}

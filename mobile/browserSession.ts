export class MobileError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
interface ProjectSession { id?: string; domain?: string; token?: string; apiUrl?: string; projectName?: string; name?: string }
/** URL 仅选择入口；显式项目必须有其自身会话，平台应用允许没有租户域名。 */
export function resolveBrowserSession(projectCode: string, applicationId: string, rawProject: string | null,
  platformToken: unknown, origin: string) {
  let project: ProjectSession = {}
  if (projectCode) {
    try {
      const parsed = JSON.parse(rawProject || 'null')
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
      project = parsed
    } catch { throw new MobileError(401, 'Mobile.sessionRequired') }
  }
  const token = projectCode ? project.token : platformToken
  if (!applicationId || typeof token !== 'string' || !token.trim())
    throw new MobileError(401, 'Mobile.sessionRequired')
  const api = new URL(project.apiUrl || '/api', origin)
  if (api.origin !== origin) throw new MobileError(400, 'Mobile.sameOriginRequired')
  const domain = typeof project.domain === 'string' ? project.domain.trim() : ''
  // 应用 ID 不能被当作租户域名发送，避免平台应用被误路由。
  return { project, token, domain: domain && domain !== applicationId ? domain : undefined,
    api: api.pathname.replace(/\/$/, '') }
}

import { getCurrentScope, onScopeDispose, reactive, ref, shallowRef, watch } from 'vue'
import JSEncrypt from 'jsencrypt'
import { MobileError } from '../browserSession'
import { verifySession as verifySessionForLogin, authState, clearSession, sessionRequest, setSession, VerificationRequired, requestedApplicationId } from './session'

export interface CaptchaConfig {
  enabled: boolean
  type: string
  loginWithVerify?: boolean
  altcha?: { contextUrl: string; challengeUrl: string; prevalidateUrl: string }
}
export interface CaptchaRequirement { config: CaptchaConfig; key?: string; contextToken?: string }
export interface CaptchaResult {
  verification?: { key: string; token: string }
  proof?: string
  contextToken?: string
  verifyKey?: string
  verifyCode?: string
}

/** 对齐应用链接登录：账号原样提交，入口应用 ID 用于授权，不要求项目编码或拼接账号后缀。 */
export function useLogin() {
  const form = reactive({ username: '', password: '' })
  const loading = ref(false), error = ref(''), verification = shallowRef<CaptchaRequirement>()
  let controller: AbortController | undefined
  let pending: { resolve: (value: CaptchaResult) => void; reject: (error: Error) => void } | undefined
  const request = <T>(path: string, body?: unknown) => sessionRequest<T>(path, body === undefined ? 'GET' : 'POST', body,
    { scoped: false, signal: controller?.signal })
  const requireVerification = (requirement: CaptchaRequirement) => new Promise<CaptchaResult>((resolve, reject) => {
    pending = { resolve, reject }; verification.value = requirement
  })
  function completeVerification(result: CaptchaResult) {
    const current = pending; pending = undefined; verification.value = undefined; current?.resolve(result)
  }
  function cancelVerification() {
    controller?.abort()
    const current = pending; pending = undefined; verification.value = undefined
    current?.reject(new MobileError(400, 'Mobile.loginCancelled'))
  }
  const stop = watch(() => [form.username, form.password], () => {
    if (loading.value) cancelVerification()
  }, { flush: 'sync' })
  if (getCurrentScope()) onScopeDispose(() => { cancelVerification(); stop() })

  async function login() {
    if (loading.value) return false
    loading.value = true; error.value = ''
    const attempt = new AbortController(); controller = attempt
    const input = { ...form }
    try {
      const applicationId = requestedApplicationId()
      const username = input.username.trim()
      if (!username || !input.password) throw new MobileError(400, 'Mobile.loginRequired')
      const config = await request<{ encrypt?: { enabled: boolean; id: string; publicKey: string } }>('/authorize/login/configs')
      let password = input.password
      if (config.encrypt?.enabled) {
        if (!config.encrypt.id || !config.encrypt.publicKey) throw new MobileError(400, 'Mobile.passwordEncryptFailed')
        const rsa = new JSEncrypt(); rsa.setPublicKey(config.encrypt.publicKey)
        const encrypted = rsa.encrypt(password)
        if (!encrypted) throw new MobileError(400, 'Mobile.passwordEncryptFailed')
        password = encrypted
      }
      const captcha = await request<CaptchaConfig>('/authorize/captcha/config')
      let proof: CaptchaResult = {}
      // 兼容旧图形验证码配置；新版平台仅在需要时返回验证挑战。
      if (captcha.enabled && captcha.loginWithVerify !== true) {
        if (captcha.type === 'altcha') {
          if (!captcha.altcha) throw new MobileError(400, 'Mobile.verificationUnavailable')
          const context = await request<{ contextToken: string }>(captcha.altcha.contextUrl, { operation: 'login.captcha', target: username })
          if (!context.contextToken) throw new MobileError(502, 'Mobile.verificationUnavailable')
          proof = await requireVerification({ config: captcha, contextToken: context.contextToken })
        } else proof = await requireVerification({ config: captcha })
      }
      const body = { username, password, encryptId: config.encrypt?.enabled ? config.encrypt.id : undefined, expires: 3600000, ...proof }
      let result: { token: string }
      try { result = await request('/authorize/login', body) }
      catch (value) {
        if (!(value instanceof VerificationRequired)) throw value
        const completed = await requireVerification({ config: captcha, key: value.key })
        if (!completed.verification) throw new MobileError(400, 'Mobile.verificationRequired')
        result = await sessionRequest('/authorize/login', 'POST', body,
          { scoped: false, signal: attempt.signal, verification: completed.verification })
      }
      if (!result.token) throw new MobileError(502, 'Mobile.requestFailed')
      const session = { token: result.token, applicationId }
      const authorization = await verifySessionForLogin(session, attempt.signal)
      if (attempt.signal.aborted) throw new MobileError(400, 'Mobile.loginCancelled')
      controller = undefined
      setSession(session); authState.authorization = authorization
      loading.value = false; form.password = ''
      return true
    } catch (value) {
      clearSession()
      error.value = attempt.signal.aborted ? 'Mobile.loginCancelled' : value instanceof Error ? value.message : 'Mobile.requestFailed'
      return false
    } finally { controller = undefined; pending = undefined; verification.value = undefined; loading.value = false }
  }
  return { form, loading, error, verification, completeVerification, cancelVerification, login }
}

export async function logout() {
  try {
    if (authState.session) await sessionRequest('/user-token/reset', 'GET', undefined, { scoped: false, session: authState.session })
  }
  finally { clearSession() }
}

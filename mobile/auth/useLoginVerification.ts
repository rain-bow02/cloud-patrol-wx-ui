import { onScopeDispose, ref } from 'vue'
import { MobileError } from '../browserSession'
import { sessionRequest } from './session'
import type { CaptchaRequirement, CaptchaResult } from './useLogin'

/** 安全验证仅交换验证码/证明，不接触已有会话；弹窗关闭即取消所有请求。 */
export function useLoginVerification(requirement: CaptchaRequirement, success: (result: CaptchaResult) => void) {
  const loading = ref(false), error = ref(''), image = ref(''), imageKey = ref(''), imageCode = ref('')
  const controller = new AbortController()
  let disposed = false
  const request = <T>(path: string, body?: unknown) => sessionRequest<T>(path, body === undefined ? 'GET' : 'POST', body,
    { scoped: false, signal: controller.signal })
  const context = requirement.key ? { key: requirement.key } : { contextToken: requirement.contextToken }
  const showError = (value: unknown) => { if (!disposed) error.value = value instanceof Error ? value.message : 'Mobile.verificationFailed' }
  async function complete(params: { verifyKey?: string; verifyCode?: string; proof?: string }) {
    let result: CaptchaResult = params
    if (requirement.key) {
      const confirmed = await request<{ token: string }>('/verify/captcha/_confirm', {
        key: requirement.key, provider: requirement.config.type, params,
      })
      if (!confirmed.token) throw new MobileError(400, 'Mobile.verificationFailed')
      result = { verification: { key: requirement.key, token: confirmed.token } }
    } else if (requirement.config.type === 'altcha') result = { ...params, contextToken: requirement.contextToken }
    if (!disposed) success(result)
  }
  async function load(configure: (challenge: Record<string, unknown>) => Promise<void>) {
    if (loading.value) return
    loading.value = true; error.value = ''; imageCode.value = ''; image.value = ''; imageKey.value = ''
    try {
      if (requirement.config.type === 'image') {
        const result = await request<{ base64: string; key: string }>('/authorize/captcha/image?width=160&height=44')
        if (!result.base64 || !result.key) throw new MobileError(502, 'Mobile.verificationUnavailable')
        if (!disposed) { image.value = result.base64; imageKey.value = result.key }
      } else if (requirement.config.type === 'altcha') {
        if (!requirement.config.altcha || !requirement.key && !requirement.contextToken)
          throw new MobileError(400, 'Mobile.verificationUnavailable')
        const challenge = await request<Record<string, unknown>>(requirement.config.altcha.challengeUrl, context)
        if (!disposed) await configure(challenge)
      } else throw new MobileError(400, 'Mobile.captchaUnsupported')
    } catch (value) { showError(value) }
    finally { if (!disposed) loading.value = false }
  }
  async function verified(payload?: string) {
    if (!payload || loading.value) return
    loading.value = true; error.value = ''
    try {
      if (!requirement.config.altcha) throw new MobileError(400, 'Mobile.verificationUnavailable')
      const result = await request<{ proof: string; expiresAt: number }>(requirement.config.altcha.prevalidateUrl, { ...context, payload })
      if (!result.proof || !Number.isFinite(result.expiresAt) || result.expiresAt <= Date.now())
        throw new MobileError(400, 'Mobile.verificationExpired')
      await complete({ proof: result.proof })
    } catch (value) { showError(value) }
    finally { if (!disposed) loading.value = false }
  }
  async function confirmImage() {
    if (!imageCode.value.trim() || !imageKey.value || loading.value) return
    loading.value = true; error.value = ''
    try { await complete({ verifyKey: imageKey.value, verifyCode: imageCode.value.trim() }) }
    catch (value) { showError(value) }
    finally { if (!disposed) loading.value = false }
  }
  onScopeDispose(() => { disposed = true; controller.abort() })
  return { loading, error, image, imageCode, load, verified, confirmImage }
}

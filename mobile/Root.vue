<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { Button, ConfigProvider, Loading as Spin } from 'vant'
import Alert from './components/Notice.vue'
import { useI18n } from 'vue-i18n'
import App from './App.vue'
import LoginPage from './auth/LoginPage.vue'
import { authState, clearSession, initializeConfig, restoreSession, requestedApplicationId } from './auth/session'
import { logout } from './auth/useLogin'
import { hosted, hostState, initializeHost, host } from './transport'
const { t, te } = useI18n()
const ready = ref(false), configError = ref(''), notice = ref(''), loggingOut = ref(false)
let explicitLogout = false
watch(() => authState.session, (session, previous) => {
  if (!session && previous && !explicitLogout) notice.value = 'Mobile.sessionRequired'
  else if (session) notice.value = ''
})
async function start() {
  ready.value = false; configError.value = ''; notice.value = ''
  try {
    if (hosted) { await initializeHost(); return }
    await initializeConfig()
    requestedApplicationId()
    if (authState.session) {
      try { await restoreSession() }
      catch (error) { clearSession(); notice.value = error instanceof Error ? error.message : 'Mobile.requestFailed' }
    }
  } catch (error) { configError.value = error instanceof Error ? error.message : 'Mobile.loginConfigFailed' }
  finally { ready.value = true }
}
async function signOut() {
  if (loggingOut.value) return
  loggingOut.value = true; explicitLogout = true
  try { await logout() } catch { /* 服务器退出失败也结束当前标签页会话。 */ }
  finally { notice.value = ''; loggingOut.value = false; explicitLogout = false }
}
onMounted(() => { void start() })
</script>

<template>
  <ConfigProvider :theme-vars="{ primaryColor: '#2979ff' }">
    <div v-if="!ready" class="auth-loading"><Spin>{{ t('Mobile.loading') }}</Spin></div>
    <section v-else-if="configError || hostState.error" class="patrol-config-error panel"><Alert type="error" show-icon :message="te(hostState.error || configError) ? t(hostState.error || configError) : hostState.error || configError" /><Button v-if="hosted && host.back" block @click="host.back()">{{ t('Mobile.backToApp') }}</Button><Button block @click="start">{{ t('Mobile.retry') }}</Button></section>
    <App v-else-if="hosted || authState.session && authState.authorization" :key="hosted ? hostState.context?.applicationId : authState.session?.applicationId" :standalone="!hosted" :logging-out="loggingOut" @logout="signOut" />
    <LoginPage v-else :notice="notice" />
  </ConfigProvider>
</template>
<style scoped>
.auth-loading, .patrol-config-error { max-width: 420px; margin: 80px auto; padding: 24px; }
.patrol-config-error .van-button { margin-top: 16px; }
</style>

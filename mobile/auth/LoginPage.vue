<script setup lang="ts">
import { Field } from 'vant'
import { defineAsyncComponent, reactive } from 'vue'
import { Button, Form } from 'vant'
import Alert from '../components/Notice.vue'
import { useI18n } from 'vue-i18n'
import patrolScene from '../assets/patrol-scene.svg'
import { authState } from './session'
import { useLogin } from './useLogin'
const LoginVerification = defineAsyncComponent(() => import('./LoginVerification.vue'))
const props = defineProps<{ notice?: string }>()
const { t, te } = useI18n()
const vm = reactive(useLogin())
</script>

<template>
  <section class="patrol-login">
    <div class="login-content">
      <div class="login-heading">
        <div class="login-brand">{{ authState.config.title || t('Mobile.title') }}<span>{{ t('Mobile.loginWorkplace') }}</span><p>{{ t('Mobile.heroHint') }}</p></div>
        <img :src="patrolScene" class="login-art" alt="" width="320" height="240" />
      </div>
      <div class="panel">
        <h1>{{ t('Mobile.welcome') }}</h1>
        <p class="muted">{{ t('Mobile.loginHint') }}</p>
        <Alert v-if="vm.error || props.notice" type="error" show-icon :message="te(vm.error || props.notice || '') ? t(vm.error || props.notice || '') : vm.error || props.notice || ''" />
        <Form @submit="vm.login">
          <Field v-model="vm.form.username" :label="t('Mobile.loginAccount')" :placeholder="t('Mobile.loginAccountPlaceholder')" autocomplete="username" :maxlength="128" :disabled="vm.loading" :rules="[{ required: true, message: t('Mobile.loginRequired') }]" />
          <Field v-model="vm.form.password" type="password" :label="t('Mobile.loginPassword')" :placeholder="t('Mobile.passwordPlaceholder')" autocomplete="current-password" :disabled="vm.loading" :rules="[{ required: true, message: t('Mobile.loginRequired') }]" />
          <Button type="primary" native-type="submit" block size="large" :loading="vm.loading">{{ t('Mobile.login') }}</Button>
        </Form>
      </div>
      <p class="login-footnote">{{ t('Mobile.loginFootnote') }}</p>
    </div>
    <LoginVerification v-if="vm.verification" :requirement="vm.verification" @success="vm.completeVerification" @cancel="vm.cancelVerification" />
  </section>
</template>

<style scoped>
.patrol-login { min-height: 100vh; min-height: 100dvh; padding: max(36px, env(safe-area-inset-top)) 22px max(28px, env(safe-area-inset-bottom)); background: radial-gradient(ellipse at 90% 0%, #dcebff 0, transparent 55%), linear-gradient(160deg, #eef5ff, #f9fbff 70%); color: #293d59; }
.login-content { width: min(100%, 420px); margin: auto; }
.login-heading { position: relative; display: flex; align-items: center; min-height: 168px; margin-bottom: 20px; }
.login-brand { position: relative; z-index: 1; max-width: 62%; font-size: 28px; font-weight: 700; color: #285c99; line-height: 1.4; }
.login-brand span { display: block; margin-top: 8px; color: #6a8bb4; font-size: 12px; font-weight: 400; letter-spacing: 3px; }
.login-brand p { margin: 14px 0 0; color: #7d95b2; font-size: 11px; font-weight: 400; line-height: 1.8; }
.login-art { position: absolute; width: 172px; height: auto; right: -14px; top: 8px; pointer-events: none; }
.panel { background: #fff; border: 1px solid #ffffffc9; border-radius: 20px; padding: 28px 24px; box-shadow: 0 10px 40px #476f9c08; margin: 0; }
h1 { text-align: left; color: #293d59; font-size: 22px; font-weight: 650; margin: 0 0 8px; }
.muted { color: #8a98ae; font-size: 12px; line-height: 1.8; margin: 0 0 26px; }
.van-notice-bar { margin-bottom: 18px; }
:deep(.van-field__label) { color: #617896; font-size: 13px; }
:deep(.van-field) { min-height: 46px; padding: 10px 12px; background: #fafcff; border-color: #dde7f4; border-radius: 9px; }
:deep(.van-field__control) { background: transparent; font-size: 14px; }
:deep(.van-field__left-icon) { color: #7ba6dd; margin-right: 10px; }
:deep(.van-field__control::placeholder) { color: #b1bccb; }
.van-button--primary { height: 46px; margin-top: 2px; border-radius: 10px; background: #2979ff; box-shadow: 0 5px 12px #2979ff1a; font-weight: 600; }
.login-footnote { color: #8d9fba; font-size: 11px; letter-spacing: 1px; line-height: 1.8; text-align: center; margin: 26px 0 0; }
@media (max-width: 359px) { .patrol-login { padding-inline: 16px; padding-top: max(24px, env(safe-area-inset-top)); } .login-brand { font-size: 25px; } .login-art { width: 144px; right: -10px; top: 18px; } .login-heading { min-height: 150px; margin-bottom: 12px; } .panel { padding: 24px 20px; } }
</style>

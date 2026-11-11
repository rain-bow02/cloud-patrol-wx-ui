<script setup lang="ts">
import { Field } from 'vant'
import 'altcha/external'
import 'altcha/altcha.css'
import 'altcha/i18n/zh-cn'
import 'altcha/i18n/en'
import Pbkdf2Worker from 'altcha/workers/pbkdf2?worker'
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Button, Loading as Spin, Dialog } from 'vant'
import Alert from '../components/Notice.vue'
import { useI18n } from 'vue-i18n'
import type { CaptchaRequirement, CaptchaResult } from './useLogin'
import { useLoginVerification } from './useLoginVerification'
interface Widget extends HTMLElement { configure(options: Record<string, unknown>): Promise<void> }
declare const $altcha: { algorithms: Map<string, () => Worker> }
for (const algorithm of ['SHA-256', 'SHA-384', 'SHA-512']) $altcha.algorithms.set(`PBKDF2/${algorithm}`, () => new Pbkdf2Worker())
const props = defineProps<{ requirement: CaptchaRequirement }>()
const emit = defineEmits<{ success: [result: CaptchaResult]; cancel: [] }>()
const { t, te, locale } = useI18n()
const vm = reactive(useLoginVerification(props.requirement, result => emit('success', result)))
const widget = ref<Widget>()
const verified = (event: Event) => { void vm.verified((event as CustomEvent<{ payload?: string }>).detail?.payload) }
const load = () => vm.load(async challenge => {
  if (!widget.value) throw Error(t('Mobile.verificationUnavailable'))
  await widget.value.configure({ auto: 'off', challenge, hideFooter: true, hideLogo: true,
    language: locale.value.startsWith('zh') ? 'zh-cn' : 'en', workers: 2, retryOnOutOfMemoryError: false })
})
onMounted(() => { widget.value?.addEventListener('verified', verified); void load() })
onBeforeUnmount(() => { widget.value?.removeEventListener('verified', verified) })
</script>
<template>
  <Dialog :show="true" :title="t('Mobile.securityVerification')" :show-confirm-button="false" show-cancel-button :close-on-click-overlay="false" @cancel="emit('cancel')">
    <Alert v-if="vm.error" :message="te(vm.error) ? t(vm.error) : vm.error" type="error" show-icon class="verification-error" />
    <div class="verification-body"><Spin v-if="vm.loading" />
      <altcha-widget v-if="requirement.config.type === 'altcha'" ref="widget" :inert="vm.loading" />
      <template v-else-if="vm.image">
        <div class="captcha-row">
          <Field v-model="vm.imageCode" :aria-label="t('Mobile.loginCaptcha')" autocomplete="off" :maxlength="8" :disabled="vm.loading" @keyup.enter="vm.confirmImage" />
          <Button :aria-label="t('Mobile.refreshCaptcha')" :disabled="vm.loading" @click="load"><img :src="vm.image" :alt="t('Mobile.loginCaptcha')" /></Button>
        </div>
        <Button type="primary" block class="verification-action" :disabled="!vm.imageCode.trim()" :loading="vm.loading" @click="vm.confirmImage">{{ t('Mobile.verifyAndLogin') }}</Button>
      </template>
    </div>
    <Button v-if="vm.error" block class="verification-action" :disabled="vm.loading" @click="load">{{ t('Mobile.reloadVerification') }}</Button>
  </Dialog>
</template>
<style scoped>
altcha-widget { display: block; width: 100%; --altcha-max-width: 100%; }
.verification-body { padding: 20px; }
.verification-error { margin-bottom: 16px; }
.verification-action { margin-top: 16px; }
.captcha-row { display: flex; gap: 12px; }
.captcha-row .van-field__control { min-width: 0; }
.captcha-row .van-button { padding: 0; height: 44px; flex-shrink: 0; overflow: hidden; }
.captcha-row img { display: block; width: 140px; height: 42px; object-fit: contain; }
</style>

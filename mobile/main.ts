import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import { zh, en } from './messages'
import Root from './Root.vue'
import zhPatrol from '../locales/lang/zh.json'
import enPatrol from '../locales/lang/en.json'
import 'vant/lib/index.css'
import './style.css'
createApp(Root).use(createI18n({ legacy: false, locale: 'zh', fallbackLocale: 'en', messages: { zh: { Mobile: zh, Patrol: zhPatrol.Patrol }, en: { Mobile: en, Patrol: enPatrol.Patrol } } })).mount('#app')

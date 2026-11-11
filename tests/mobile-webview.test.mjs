import test from 'node:test'
import assert from 'node:assert/strict'
import { createRenderer, computed, ref } from 'vue'
import { useWebView } from '../mobile/useWebView.ts'

test('WebView history handles native back, pending submissions, keyboard resize and cleanup', () => {
  const old = { window: globalThis.window, document: globalThis.document, history: globalThis.history }
  const events = {}, viewportEvents = {}, documentEvents = {}, calls = []
  const viewport = { height: 844, addEventListener: (key, fn) => viewportEvents[key] = fn, removeEventListener: key => delete viewportEvents[key] }
  globalThis.window = { innerHeight: 844, visualViewport: viewport, addEventListener: (key, fn) => events[key] = fn, removeEventListener: key => delete events[key] }
  globalThis.document = { activeElement: null, addEventListener: (key, fn) => documentEvents[key] = fn, removeEventListener: key => delete documentEvents[key] }
  globalThis.history = { state: {}, pushState: (state) => { history.state = state; calls.push(['push',state.patrolScreen]) }, replaceState: state => { history.state = state; calls.push(['replace',state.patrolScreen]) }, go: delta => calls.push(['go',delta]) }
  const renderer = createRenderer({ insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}), setText() {}, setElementText() {}, parentNode() {}, nextSibling() {}, patchProp() {} })
  const page = ref({ key:'tasks', depth:0 }), busy = ref(false)
  let backed = 0, state
  const app = renderer.createApp({ setup() { state = useWebView(computed(()=>page.value), computed(()=>busy.value), () => { backed++; page.value = {key:'point:p',depth:1} }); return () => null } })
  try {
    app.mount({})
    page.value = {key:'point:p',depth:1}; page.value = {key:'task:t',depth:2}
    assert.deepEqual(calls.slice(-2), [['push','point:p'],['push','task:t']])
    busy.value = true; events.popstate()
    assert.equal(backed,0); assert.deepEqual(calls.at(-1),['push','task:t'])
    busy.value = false; events.popstate()
    assert.equal(backed,1); assert.equal(page.value.key,'point:p')
    page.value = {key:'tasks',depth:0}
    assert.deepEqual(calls.at(-1),['go',-1]); events.popstate(); assert.equal(backed,1)
    document.activeElement = { matches: () => true }; documentEvents.focusin()
    viewport.height = 500; viewportEvents.resize(); assert.equal(state.keyboardOpen.value,true)
    document.activeElement = null; documentEvents.focusout(); assert.equal(state.keyboardOpen.value,false)
    app.unmount(); assert.deepEqual(events,{}); assert.deepEqual(documentEvents,{}); assert.deepEqual(viewportEvents,{})
  } finally {
    for (const [key,value] of Object.entries(old)) { if(value===undefined) delete globalThis[key]; else globalThis[key]=value }
  }
})

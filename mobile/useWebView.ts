import { onMounted, onUnmounted, ref, watch, type ComputedRef } from 'vue'

/** 页面内跳转写入浏览器历史，使 WebView.goBack() 返回上一级；待确认提交禁止直接退出表单。 */
export function useWebView(screen: ComputedRef<{ key: string; depth: number }>, locked: ComputedRef<boolean>, goBack: () => void) {
  const keyboardOpen = ref(false)
  let navigatingBack = false, ignorePop = false, baseline = 0
  const editable = () => document.activeElement?.matches('input:not([type=file]),textarea,[contenteditable=true]')
  function viewportChanged() {
    const height = window.visualViewport?.height || window.innerHeight
    if (!editable()) baseline = height
    keyboardOpen.value = !!editable() && baseline - height > 140
  }
  function popped() {
    if (ignorePop) { ignorePop = false; return }
    if (locked.value) {
      history.pushState({ ...history.state, patrolScreen: screen.value.key }, '')
      return
    }
    navigatingBack = true
    try { goBack() } finally { navigatingBack = false }
  }
  const stop = watch(screen, (current, previous) => {
    if (navigatingBack || current.key === previous.key) return
    if (current.depth > previous.depth) history.pushState({ ...history.state, patrolScreen: current.key }, '')
    else if (current.depth === previous.depth) history.replaceState({ ...history.state, patrolScreen: current.key }, '')
    else { ignorePop = true; history.go(current.depth - previous.depth) }
  }, { flush: 'sync' })
  onMounted(() => {
    baseline = window.visualViewport?.height || window.innerHeight
    history.replaceState({ ...history.state, patrolScreen: screen.value.key }, '')
    window.addEventListener('popstate', popped)
    window.addEventListener('resize', viewportChanged)
    window.visualViewport?.addEventListener('resize', viewportChanged)
    document.addEventListener('focusin', viewportChanged)
    document.addEventListener('focusout', viewportChanged)
  })
  onUnmounted(() => {
    stop(); window.removeEventListener('popstate', popped); window.removeEventListener('resize', viewportChanged)
    window.visualViewport?.removeEventListener('resize', viewportChanged)
    document.removeEventListener('focusin', viewportChanged); document.removeEventListener('focusout', viewportChanged)
  })
  return { keyboardOpen }
}

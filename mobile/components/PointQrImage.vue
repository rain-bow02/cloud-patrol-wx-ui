<script setup lang="ts">
import { ref, watch } from 'vue'
import QRCode from 'qrcode'
const props = defineProps<{ value: string }>(), canvas = ref<HTMLCanvasElement>()
watch([() => props.value, canvas], async () => { if (canvas.value) await QRCode.toCanvas(canvas.value, props.value, { width: 240, margin: 2 }) }, { immediate: true, flush: 'post' })
</script>
<template><canvas ref="canvas" style="max-width:100%;height:auto" /></template>

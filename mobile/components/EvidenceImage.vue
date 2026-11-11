<script setup lang="ts">
import { Image, showImagePreview } from 'vant'
const props = defineProps<{ src: string; alt?: string; width?: number }>()
</script>
<template><Image :src="src" :alt="alt" :width="width || 160" fit="contain" radius="8" @click="showImagePreview({ images: [props.src], closeable: true })" /></template>

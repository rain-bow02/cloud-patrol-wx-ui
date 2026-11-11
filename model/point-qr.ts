/** 点位 UUID 是二维码的稳定内容；不含登录信息，也不授予点位或任务权限。 */
export function pointQrValue(point: { id?: string }): string { return point.id || '' }
/** 名称只用于本地文件名；点位识别始终使用 UUID，不随改名、编码变更而改变。 */
export function pointQrFilename(point: { name: string; code?: string }): string {
  return `${point.name}-${point.code || ''}`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 150) + '.png'
}

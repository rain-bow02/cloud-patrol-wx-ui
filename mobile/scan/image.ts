/** 二维码图片仅在本机解码，不上传原图，不调用摄像头或宿主原生扫码。 */
export async function readQrImage(file: File): Promise<string> {
  if (!file.size || file.size > 10 * 1024 * 1024 || !file.type.startsWith('image/'))
    throw new Error('Mobile.scanImageInvalid')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Mobile.scanImageInvalid'))
      image.src = url
    })
    const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Mobile.scanFailed')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    const decode = (await import('jsqr')).default
    const result = decode(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' })
    if (!result?.data) throw new Error('Mobile.scanImageNoCode')
    return result.data
  } finally { URL.revokeObjectURL(url) }
}

/**
 * Browser-only: shrinks a photo before upload (REQ-110). A phone photo is 3-8 MB; the website needs ~1600px,
 * so shrinking keeps the Supabase storage small and the Gallery page fast. Output is always JPEG.
 */
export async function shrinkImage(file: File, maxSide = 1600, quality = 0.82): Promise<{ blob: Blob; mimeType: 'image/jpeg' }> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(`"${file.name}" could not be read. Use a JPG, PNG or WebP picture.`)
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Your browser could not process the picture.')
    ctx.fillStyle = '#ffffff' // PNG transparency becomes white instead of black
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) throw new Error(`"${file.name}" could not be converted.`)
    return { blob, mimeType: 'image/jpeg' }
  } finally {
    bitmap.close?.()
  }
}

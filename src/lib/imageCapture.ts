export type CapturedImage = {
  data: string
  mediaType: 'image/jpeg'
  previewUrl: string
}

// 1024/0.78 достаточно, чтобы AI разобрал еду, но ощутимо меньше байт чем 1280/0.85.
// 5 фото + текст раньше вылезали за body-limit туннеля (~4.5 MB), теперь помещаются
// с запасом (≈200–300 KB на кадр × 5 = ~1.5 MB в JSON).
const MAX_LONGEST_SIDE = 1024
const JPEG_QUALITY = 0.78
const MAX_FILE_SIZE = 12 * 1024 * 1024

/**
 * Открывает нативный диалог камеры/галереи, возвращает сжатый JPEG в base64.
 * `fromCamera` — capture=environment, на мобильных открывает заднюю камеру.
 * Возвращает null, если пользователь отменил выбор.
 */
export function captureImage(opts: { fromCamera?: boolean } = {}): Promise<CapturedImage | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    if (opts.fromCamera) input.setAttribute('capture', 'environment')
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    input.style.opacity = '0'
    document.body.appendChild(input)

    let settled = false
    const cleanup = () => {
      try {
        document.body.removeChild(input)
      } catch {
        /* already removed */
      }
    }

    const onChange = async () => {
      if (settled) return
      settled = true
      const file = input.files?.[0]
      cleanup()
      if (!file) {
        resolve(null)
        return
      }
      if (file.size > MAX_FILE_SIZE) {
        reject(new Error('file-too-large'))
        return
      }
      try {
        resolve(await captureImageFile(file))
      } catch (e) {
        reject(e instanceof Error ? e : new Error('process-failed'))
      }
    }

    const onCancel = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve(null)
    }

    input.addEventListener('change', () => void onChange())
    input.addEventListener('cancel', onCancel)

    input.click()
  })
}

export async function captureImageFile(file: File): Promise<CapturedImage> {
  if (file.size > MAX_FILE_SIZE) throw new Error('file-too-large')
  const img = await fileToImage(file)
  const { blob, dataUrl } = await compress(img)
  const data = dataUrl.replace(/^data:[^;]+;base64,/, '')
  return {
    data,
    mediaType: 'image/jpeg',
    previewUrl: URL.createObjectURL(blob),
  }
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image-load-failed'))
    }
    img.src = url
  })
}

async function compress(img: HTMLImageElement): Promise<{ blob: Blob; dataUrl: string }> {
  const { naturalWidth: w, naturalHeight: h } = img
  const scale = Math.min(1, MAX_LONGEST_SIDE / Math.max(w, h))
  const targetW = Math.round(w * scale)
  const targetH = Math.round(h * scale)
  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no-canvas-ctx')
  ctx.drawImage(img, 0, 0, targetW, targetH)
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('blob-failed'))),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
  return { blob, dataUrl }
}

export function releasePreview(previewUrl: string | null | undefined): void {
  if (!previewUrl) return
  try {
    URL.revokeObjectURL(previewUrl)
  } catch {
    /* ignore */
  }
}

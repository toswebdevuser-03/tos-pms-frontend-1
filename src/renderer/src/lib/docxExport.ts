import { Document, Packer } from 'docx'

export type WordImageType = 'png' | 'jpeg' | 'gif' | 'bmp' | 'tiff'

export interface WordImageData {
  data: Uint8Array
  type: WordImageType
}

export function parseDataUri(dataUri: string): WordImageData | null {
  const match = dataUri.match(/^data:(image\/(png|jpe?g|gif|bmp|tiff));base64,(.+)$/i)
  if (!match) return null
  const [, , ext, b64] = match
  const type = ext.toLowerCase() === 'jpg' ? 'jpeg' : (ext.toLowerCase() as WordImageType)
  try {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
    return { data: bytes, type }
  } catch {
    return null
  }
}

export async function downloadWordDocx(filename: string, doc: Document): Promise<void> {
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.docx') ? filename : `${filename}.docx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

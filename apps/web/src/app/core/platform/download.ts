/**
 * Saves a blob as a file through a temporary object URL and link (no
 * dependency, works in the installed PWA). The URL is revoked right after.
 */
export function downloadBlob(document: Document, blob: Blob, filename: string): void {
  const view = document.defaultView
  if (!view) {
    return
  }
  const url = view.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  view.setTimeout(() => view.URL.revokeObjectURL(url), 0)
}

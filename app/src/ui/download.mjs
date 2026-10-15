/** Save text as a file through a temporary link (nothing leaves the page). */
export function download(filename, text, type) {
  downloadBlob(filename, new Blob([text], { type: `${type};charset=utf-8` }));
}

/** Save a Blob (a PDF, an image) as a file the same way. */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

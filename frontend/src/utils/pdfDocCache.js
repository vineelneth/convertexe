import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).href;

// WeakMap: File → Promise<PDFDocumentProxy>
// The PDF is only loaded once per File object; GC'd when the file is no longer referenced.
const cache = new WeakMap();

export function getPdfDocument(file) {
  if (!file) return Promise.reject(new Error('no file'));
  if (cache.has(file)) return cache.get(file);
  const p = file
    .arrayBuffer()
    .then(buf => pdfjsLib.getDocument({ data: buf }).promise);
  cache.set(file, p);
  return p;
}

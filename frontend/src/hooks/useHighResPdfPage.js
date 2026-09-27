import { useState, useEffect, useRef } from 'react';
import { getPdfDocument } from '../utils/pdfDocCache';

export function useHighResPdfPage(file, pageNum, { width = 680 } = {}) {
  const [dataUrl, setDataUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  // Per-file render cache: key `${pageNum}@${width}` → dataUrl
  const renderCache = useRef(new Map());
  const lastFile = useRef(null);

  if (lastFile.current !== file) {
    lastFile.current = file;
    renderCache.current = new Map();
  }

  useEffect(() => {
    if (!file || !pageNum) { setDataUrl(null); setPageCount(0); return; }

    const key = `${pageNum}@${width}`;
    if (renderCache.current.has(key)) {
      setDataUrl(renderCache.current.get(key));
      return;
    }

    let cancelled = false;
    setLoading(true);
    setDataUrl(null);

    (async () => {
      try {
        const pdf = await getPdfDocument(file);
        if (cancelled) return;
        setPageCount(pdf.numPages);
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;
        const vp = page.getViewport({ scale: 1 });
        const scale = width / vp.width;
        const scaled = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = scaled.width;
        canvas.height = scaled.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled }).promise;
        if (cancelled) return;
        const url = canvas.toDataURL('image/jpeg', 0.92);
        renderCache.current.set(key, url);
        setDataUrl(url);
      } catch {
        // silently fail — preview is enhancement only
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [file, pageNum, width]);

  return { dataUrl, loading, pageCount };
}

import { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href;

export function usePdfThumbnails(file, { maxPages = 20, width = 120 } = {}) {
  const [thumbnails, setThumbnails] = useState([]);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!file) { setThumbnails([]); setPageCount(0); return; }
    let cancelled = false;
    setLoading(true);
    setThumbnails([]);

    (async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;
        const count = Math.min(pdf.numPages, maxPages);
        setPageCount(pdf.numPages);
        const results = [];
        for (let i = 1; i <= count; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          const scale = width / viewport.width;
          const scaled = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = scaled.width;
          canvas.height = scaled.height;
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled }).promise;
          results.push({ pageNum: i, dataUrl: canvas.toDataURL('image/jpeg', 0.7) });
          if (!cancelled) setThumbnails([...results]);
        }
      } catch {
        // silently fail — thumbnails are enhancement only
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [file]);

  return { thumbnails, pageCount, loading };
}

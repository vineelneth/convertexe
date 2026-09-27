import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Minimize2, Loader2, FileText } from 'lucide-react';

// Discrete zoom levels (as multipliers of the container width)
const ZOOM = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const FIT_IDX = 6; // index of 1.0, used as starting point when leaving fit mode

/**
 * Reusable preview pane with zoom, fit, fullscreen, and optional page navigation.
 *
 * Props:
 *   src            – URL or dataUrl of the image/page to display
 *   transform      – CSS transform string (overrides rotation prop when provided)
 *   rotation       – shorthand: degrees 0 | 90 | 180 | 270, applied as rotate(Ndeg)
 *   label          – text shown in toolbar and nav bar, e.g. "Page 3 of 50"
 *   loading        – show a spinner overlay
 *   placeholder    – message shown when src is empty
 *   onPrev / onNext – callbacks for prev/next navigation (omit both to hide nav bar)
 *   hasPrev / hasNext – whether the buttons are enabled
 *   className      – extra classes on the root element (e.g. height)
 */
export default function PreviewPane({
  src,
  transform,
  rotation = 0,
  label,
  loading = false,
  placeholder = 'Upload a file to preview',
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  className = '',
}) {
  const [fitMode, setFitMode] = useState(true);
  const [zoomIdx, setZoomIdx] = useState(FIT_IDX);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  // Return to fit mode whenever the source changes
  useEffect(() => { setFitMode(true); setZoomIdx(FIT_IDX); }, [src]);

  const handleZoomIn = () => {
    if (fitMode) { setFitMode(false); setZoomIdx(FIT_IDX + 1); return; }
    setZoomIdx(i => Math.min(i + 1, ZOOM.length - 1));
  };
  const handleZoomOut = () => {
    if (fitMode) { setFitMode(false); setZoomIdx(FIT_IDX - 1); return; }
    setZoomIdx(i => Math.max(i - 1, 0));
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) containerRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const hasNav = onPrev !== undefined || onNext !== undefined;
  const zoomPct = Math.round(ZOOM[zoomIdx] * 100);

  // Build CSS transform for the image
  const cssTransform = transform !== undefined
    ? transform
    : rotation ? `rotate(${rotation}deg)` : undefined;

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden ${className}`}
    >
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 flex-shrink-0 bg-slate-900/80 gap-2">
        <span className="text-[11px] text-slate-500 font-medium truncate min-w-0 select-none">
          {label || 'Preview'}
        </span>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={handleZoomOut}
            disabled={!fitMode && zoomIdx === 0}
            title="Zoom out"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 disabled:opacity-25 transition-colors"
          >
            <ZoomOut size={12} />
          </button>
          <button
            onClick={() => { setFitMode(true); }}
            title="Fit to pane"
            className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
              fitMode
                ? 'text-indigo-400 bg-indigo-950/60'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
            }`}
          >
            Fit
          </button>
          {!fitMode && (
            <span className="text-[11px] text-slate-600 w-9 text-center tabular-nums select-none">
              {zoomPct}%
            </span>
          )}
          <button
            onClick={handleZoomIn}
            disabled={!fitMode && zoomIdx === ZOOM.length - 1}
            title="Zoom in"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 disabled:opacity-25 transition-colors"
          >
            <ZoomIn size={12} />
          </button>
          <div className="w-px h-4 bg-slate-700/60 mx-0.5" />
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
      </div>

      {/* ── Image area ───────────────────────────────────────────── */}
      <div
        className={`flex-1 min-h-0 relative bg-[#0b0f1a] ${
          fitMode ? 'flex items-center justify-center overflow-hidden' : 'overflow-auto'
        }`}
      >
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-600 z-10 bg-[#0b0f1a]/80">
            <Loader2 size={22} className="animate-spin" />
            <span className="text-xs">Rendering…</span>
          </div>
        )}

        {src ? (
          <div className={fitMode ? 'w-full h-full flex items-center justify-center p-4' : 'p-4 flex justify-center min-w-max'}>
            <img
              src={src}
              alt="Preview"
              draggable={false}
              className="rounded shadow-xl block select-none"
              style={{
                ...(fitMode
                  ? { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }
                  : { width: `${zoomPct}%` }),
                ...(cssTransform ? { transform: cssTransform, transition: 'transform 0.15s ease' } : {}),
              }}
            />
          </div>
        ) : !loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center pointer-events-none">
            <div className="w-12 h-16 border-2 border-dashed border-slate-800 rounded-lg flex items-center justify-center">
              <FileText size={18} className="text-slate-800" />
            </div>
            <p className="text-xs text-slate-700">{placeholder}</p>
          </div>
        ) : null}
      </div>

      {/* ── Navigation bar ───────────────────────────────────────── */}
      {hasNav && (
        <div className="flex items-center justify-between px-2 py-1.5 border-t border-slate-800 flex-shrink-0 bg-slate-900/80">
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={13} /> Prev
          </button>
          <span className="text-[11px] text-slate-500 select-none">{label}</span>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

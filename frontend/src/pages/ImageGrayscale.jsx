import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Contrast, Download, RefreshCw, CheckCircle,
  ZoomIn, ZoomOut, Maximize2, Minimize2, FileText,
} from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import JobStatus from '../components/JobStatus';
import PreviewWorkspace from '../components/PreviewWorkspace';
import { useJobPoller } from '../hooks/useJobPoller';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Discrete zoom levels — same set as PreviewPane
const ZOOM_LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const FIT_IDX = 6;

/**
 * Specialised preview pane for Grayscale tool.
 * Identical to PreviewPane but with a Color/Grayscale toggle in the toolbar.
 * Built inline rather than extending the shared component with conditional props.
 */
function GrayscalePreviewPane({ src, placeholder }) {
  const [showGray, setShowGray] = useState(true);
  const [fitMode, setFitMode] = useState(true);
  const [zoomIdx, setZoomIdx] = useState(FIT_IDX);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => { setFitMode(true); setZoomIdx(FIT_IDX); }, [src]);

  const handleZoomIn = () => {
    if (fitMode) { setFitMode(false); setZoomIdx(FIT_IDX + 1); return; }
    setZoomIdx(i => Math.min(i + 1, ZOOM_LEVELS.length - 1));
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

  const zoomPct = Math.round(ZOOM_LEVELS[zoomIdx] * 100);

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden h-[420px] lg:h-[500px]"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 flex-shrink-0 bg-slate-900/80 gap-2">
        {/* Color/Gray toggle */}
        <button
          onClick={() => setShowGray(g => !g)}
          disabled={!src}
          className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-30 ${
            showGray
              ? 'text-slate-300 bg-slate-800 hover:bg-slate-700'
              : 'text-indigo-300 bg-indigo-950/60 hover:bg-indigo-900/60'
          }`}
        >
          {showGray ? 'Grayscale' : 'Color'}
        </button>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={handleZoomOut} disabled={!fitMode && zoomIdx === 0} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 disabled:opacity-25 transition-colors">
            <ZoomOut size={12} />
          </button>
          <button onClick={() => setFitMode(true)} className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${fitMode ? 'text-indigo-400 bg-indigo-950/60' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}>
            Fit
          </button>
          {!fitMode && (
            <span className="text-[11px] text-slate-600 w-9 text-center tabular-nums select-none">{zoomPct}%</span>
          )}
          <button onClick={handleZoomIn} disabled={!fitMode && zoomIdx === ZOOM_LEVELS.length - 1} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 disabled:opacity-25 transition-colors">
            <ZoomIn size={12} />
          </button>
          <div className="w-px h-4 bg-slate-700/60 mx-0.5" />
          <button onClick={toggleFullscreen} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors">
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
      </div>

      {/* Image area */}
      <div className={`flex-1 min-h-0 relative bg-[#0b0f1a] ${fitMode ? 'flex items-center justify-center overflow-hidden' : 'overflow-auto'}`}>
        {src ? (
          <div className={fitMode ? 'w-full h-full flex items-center justify-center p-4' : 'p-4 flex justify-center min-w-max'}>
            <img
              src={src}
              alt="Preview"
              draggable={false}
              className="rounded shadow-xl block select-none"
              style={{
                ...(fitMode ? { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' } : { width: `${zoomPct}%` }),
                filter: showGray ? 'grayscale(1)' : 'none',
                transition: 'filter 0.2s ease',
              }}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center pointer-events-none">
            <div className="w-12 h-16 border-2 border-dashed border-slate-800 rounded-lg flex items-center justify-center">
              <FileText size={18} className="text-slate-800" />
            </div>
            <p className="text-xs text-slate-700">{placeholder}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ImageGrayscale() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { startJob, reset: resetJob, status, progress, position, result, error: hookError } = useJobPoller();

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError = status === 'failed' ? (hookError || 'Operation failed') : '';

  const handleConvert = async () => {
    if (!file) return;
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { data } = await axios.post('/api/image/grayscale', formData);
      startJob(data.jobId);
    } catch (err) { setError(err.response?.data?.error || 'Conversion failed. Please try again.'); }
    finally { setLoading(false); }
  };

  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.downloadUrl; a.download = result.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleReset = () => { setFile(null); setError(''); resetJob(); };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-slate-800/40 rounded-xl flex items-center justify-center">
          <Contrast size={20} className="text-slate-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Grayscale Converter</h1>
          <p className="text-slate-400 text-sm">Convert color images to black &amp; white</p>
        </div>
      </div>

      {(error || jobError) && (
        <div className="bg-red-950/40 border border-red-900/60 text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">
          {error || jobError}
        </div>
      )}

      {result && status === 'completed' ? (
        <div className="card max-w-lg">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-emerald-900/40 rounded-full flex items-center justify-center">
              <CheckCircle size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold text-slate-200">Conversion complete!</p>
              <p className="text-sm text-slate-400">{result.filename}</p>
            </div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 mb-5 grid grid-cols-2 gap-4">
            <div><p className="text-xs text-slate-400 mb-1">Original size</p><p className="font-semibold text-slate-200">{formatBytes(result.originalSize)}</p></div>
            <div><p className="text-xs text-slate-400 mb-1">Output size</p><p className="font-semibold text-emerald-400">{formatBytes(result.size)}</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownload} className="btn-primary flex-1 flex items-center justify-center gap-2"><Download size={16} /> Download</button>
            <button onClick={handleReset} className="btn-secondary flex-1 flex items-center justify-center gap-2"><RefreshCw size={16} /> Convert Another</button>
          </div>
        </div>
      ) : (
        <PreviewWorkspace
          preview={
            <GrayscalePreviewPane
              src={previewUrl}
              placeholder="Upload an image to preview it here"
            />
          }
        >
          <div className="card space-y-6">
            <FileDropzone
              file={file}
              onFileChange={setFile}
              accept=".jpg,.jpeg,.png,.webp,.gif,.bmp,.tiff"
              label="Drag & drop a color image here"
            />

            {!file && (
              <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-red-400" />
                    <div className="w-5 h-5 rounded-full bg-green-400" />
                    <div className="w-5 h-5 rounded-full bg-blue-400" />
                  </div>
                  <span className="text-slate-400 text-sm">→</span>
                  <div className="flex gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-gray-200" />
                    <div className="w-5 h-5 rounded-full bg-gray-400" />
                    <div className="w-5 h-5 rounded-full bg-gray-700" />
                  </div>
                  <span className="text-sm text-slate-400 font-medium ml-2">Color → Grayscale</span>
                </div>
              </div>
            )}

            <JobStatus status={status} progress={progress} position={position} error={jobError} />

            <button
              onClick={handleConvert}
              disabled={!file || isProcessing}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {isProcessing
                ? <><RefreshCw size={16} className="animate-spin" /> Converting…</>
                : <><Contrast size={16} /> Convert to Grayscale</>}
            </button>
          </div>
        </PreviewWorkspace>
      )}
    </div>
  );
}

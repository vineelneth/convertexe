import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { FileImage, Download, RefreshCw, CheckCircle, ZoomIn, X, ChevronLeft, ChevronRight } from 'lucide-react';
import FileDropzone from '../../components/FileDropzone';
import JobStatus from '../../components/JobStatus';
import { useJobPoller } from '../../hooks/useJobPoller';

function Lightbox({ pages, initialIndex, onClose, onDownload }) {
  const [index, setIndex] = useState(initialIndex);
  const page = pages[index];

  const prev = useCallback(() => setIndex(i => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIndex(i => Math.min(pages.length - 1, i + 1)), [pages.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, prev, next]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative flex flex-col items-center max-w-4xl w-full max-h-screen p-4" onClick={e => e.stopPropagation()}>
        {/* Top bar */}
        <div className="flex items-center justify-between w-full mb-3">
          <span className="text-white font-semibold text-sm">Page {page.page} of {pages.length}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDownload(page)}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <Download size={14} /> Download
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Image */}
        <div className="flex items-center gap-3 w-full">
          <button
            onClick={prev}
            disabled={index === 0}
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white rounded-lg transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 flex items-center justify-center bg-white rounded-xl overflow-hidden shadow-2xl" style={{ maxHeight: 'calc(100vh - 140px)' }}>
            <img src={page.previewUrl || page.downloadUrl} alt={`Page ${page.page}`} className="max-w-full max-h-full object-contain" style={{ maxHeight: 'calc(100vh - 140px)' }} />
          </div>
          <button
            onClick={next}
            disabled={index === pages.length - 1}
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white rounded-lg transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Thumbnail strip */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 max-w-full">
          {pages.map((p, i) => (
            <button
              key={p.page}
              onClick={() => setIndex(i)}
              className={`flex-shrink-0 w-12 h-16 rounded overflow-hidden border-2 transition-all ${i === index ? 'border-indigo-400' : 'border-transparent opacity-60 hover:opacity-100'}`}
            >
              <img src={p.previewUrl || p.downloadUrl} alt={`Page ${p.page}`} className="w-full h-full object-contain bg-white" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PdfToImages() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const { startJob, reset: resetJob, status, progress, position, result, error: hookError } = useJobPoller();

  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError = status === 'failed' ? (hookError || 'Conversion failed') : '';

  const handleConvert = async () => {
    if (!file) return;
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { data } = await axios.post('/api/pdf/to-images', formData);
      startJob(data.jobId);
    } catch (err) { setError(err.response?.data?.error || 'Upload failed.'); }
    finally { setLoading(false); }
  };

  const handleDownloadOne = (page) => {
    const a = document.createElement('a');
    a.href = page.downloadUrl; a.download = page.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleDownloadAll = async () => {
    for (const page of result.pages) {
      handleDownloadOne(page);
      await new Promise(r => setTimeout(r, 200));
    }
  };

  const handleReset = () => { setFile(null); setError(''); setLightboxIndex(null); resetJob(); };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><FileImage size={20} className="text-red-600" /></div>
        <div><h1 className="text-2xl font-bold text-gray-900">PDF to Images</h1><p className="text-gray-500 text-sm">Convert each PDF page to a PNG image</p></div>
      </div>

      {(error || jobError) && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error || jobError}</div>}

      {result && status === 'completed' ? (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><CheckCircle size={20} className="text-green-600" /></div>
            <div>
              <p className="font-semibold text-gray-800">Conversion complete!</p>
              <p className="text-sm text-gray-500">{result.pageCount} page{result.pageCount !== 1 ? 's' : ''} extracted</p>
            </div>
          </div>

          <div className="mb-4">
            <button onClick={handleDownloadAll} className="btn-primary flex items-center gap-2">
              <Download size={16} /> Download All ({result.pageCount})
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {result.pages.map((page, i) => (
              <div key={page.page} className="group border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
                <div
                  className="relative aspect-[3/4] bg-gray-50 overflow-hidden cursor-zoom-in"
                  onClick={() => setLightboxIndex(i)}
                >
                  <img
                    src={page.previewUrl || page.downloadUrl}
                    alt={`Page ${page.page}`}
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 transition-opacity">
                    <div className="bg-white/90 rounded-full p-2 shadow">
                      <ZoomIn size={16} className="text-gray-700" />
                    </div>
                  </div>
                </div>
                <div className="px-2 py-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-600">Page {page.page}</span>
                  <button
                    onClick={() => handleDownloadOne(page)}
                    title="Download"
                    className="w-6 h-6 flex items-center justify-center rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors"
                  >
                    <Download size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button onClick={handleReset} className="btn-secondary w-full mt-5 flex items-center justify-center gap-2">
            <RefreshCw size={16} /> Convert Another
          </button>
        </div>
      ) : (
        <div className="card space-y-5">
          <FileDropzone
            file={file}
            onFileChange={setFile}
            accept=".pdf"
            label="Drag & drop a PDF here"
            supportedLabel="PDF files only"
          />

          <JobStatus status={status} progress={progress} position={position} error={jobError} />

          <button onClick={handleConvert} disabled={!file || isProcessing} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <><RefreshCw size={16} className="animate-spin" /> Uploading...</>
              : isProcessing ? <><RefreshCw size={16} className="animate-spin" /> Processing...</>
              : <><FileImage size={16} /> Convert to Images</>}
          </button>
        </div>
      )}

      {lightboxIndex !== null && result?.pages && (
        <Lightbox
          pages={result.pages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDownload={handleDownloadOne}
        />
      )}
    </div>
  );
}

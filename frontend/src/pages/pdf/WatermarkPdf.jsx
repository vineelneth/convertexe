import React, { useState } from 'react';
import axios from 'axios';
import { PenLine, Download, RefreshCw, CheckCircle } from 'lucide-react';
import FileDropzone from '../../components/FileDropzone';
import JobStatus from '../../components/JobStatus';
import ErrorBanner from '../../components/ErrorBanner';
import { useJobPoller } from '../../hooks/useJobPoller';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function WatermarkPdf() {
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [opacity, setOpacity] = useState(0.3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { startJob, reset: resetJob, status, progress, position, result, error: hookError } = useJobPoller();

  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError = status === 'failed' ? (hookError || 'Watermark failed') : '';

  const handleWatermark = async () => {
    if (!file || !text.trim()) return;
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('text', text);
    formData.append('opacity', opacity);
    try {
      const { data } = await axios.post('/api/pdf/watermark', formData);
      startJob(data.jobId);
    } catch (err) { setError(err.response?.data?.error || 'Upload failed.'); }
    finally { setLoading(false); }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.downloadUrl; a.download = result.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleReset = () => { setFile(null); setText(''); setOpacity(0.3); setError(''); resetJob(); };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-red-900/40 rounded-xl flex items-center justify-center"><PenLine size={20} className="text-rose-400" /></div>
        <div><h1 className="text-2xl font-bold text-white">Watermark PDF</h1><p className="text-slate-400 text-sm">Add a diagonal text watermark to every page</p></div>
      </div>

      <ErrorBanner message={error || jobError} />

      {result && status === 'completed' ? (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-emerald-900/40 rounded-full flex items-center justify-center"><CheckCircle size={20} className="text-emerald-400" /></div>
            <div><p className="font-semibold text-slate-200">Watermark applied!</p><p className="text-sm text-slate-400">{result.filename}</p></div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 mb-5 grid grid-cols-2 gap-4">
            <div><p className="text-xs text-slate-400 mb-1">Original size</p><p className="font-semibold text-slate-200">{formatBytes(result.originalSize)}</p></div>
            <div><p className="text-xs text-slate-400 mb-1">New size</p><p className="font-semibold text-emerald-400">{formatBytes(result.size)}</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownload} className="btn-primary flex-1 flex items-center justify-center gap-2"><Download size={16} /> Download</button>
            <button onClick={handleReset} className="btn-secondary flex-1 flex items-center justify-center gap-2"><RefreshCw size={16} /> Watermark Another</button>
          </div>
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

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-1.5">Watermark text</label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="CONFIDENTIAL"
              className="w-full border border-slate-700 bg-slate-800 text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-1.5">
              Opacity: <span className="font-normal text-slate-400">{opacity}</span>
            </label>
            <input
              type="range"
              min={0.1}
              max={0.5}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1"><span>Subtle (0.1)</span><span>Visible (0.5)</span></div>
          </div>

          {text.trim() && (
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-slate-300">Preview</p>
              <div className="relative bg-white rounded-lg overflow-hidden mx-auto" style={{ aspectRatio: '1/1.414', maxHeight: '220px' }}>
                <div className="absolute inset-0 p-4 flex flex-col gap-2 justify-center">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-2 bg-gray-200 rounded" style={{ width: `${60 + (i % 3) * 15}%` }} />
                  ))}
                </div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span style={{ transform: 'rotate(-45deg)', opacity, fontSize: 'clamp(14px, 4vw, 28px)', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap', userSelect: 'none' }}>
                    {text}
                  </span>
                </div>
              </div>
            </div>
          )}

          <JobStatus status={status} progress={progress} position={position} error={jobError} />

          <button onClick={handleWatermark} disabled={!file || !text.trim() || isProcessing} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <><RefreshCw size={16} className="animate-spin" /> Uploading...</>
              : isProcessing ? <><RefreshCw size={16} className="animate-spin" /> Processing...</>
              : <><PenLine size={16} /> Add Watermark</>}
          </button>
        </div>
      )}
    </div>
  );
}

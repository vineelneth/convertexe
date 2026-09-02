import React, { useState } from 'react';
import axios from 'axios';
import { RotateCw, Download, RefreshCw, CheckCircle } from 'lucide-react';
import FileDropzone from '../../components/FileDropzone';
import JobStatus from '../../components/JobStatus';
import { useJobPoller } from '../../hooks/useJobPoller';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function RotatePdf() {
  const [file, setFile] = useState(null);
  const [angle, setAngle] = useState(90);
  const [pageMode, setPageMode] = useState('all');
  const [pageNumbers, setPageNumbers] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { startJob, reset: resetJob, status, progress, position, result, error: hookError } = useJobPoller();

  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError = status === 'failed' ? (hookError || 'Rotation failed') : '';

  const handleRotate = async () => {
    if (!file) return;
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('angle', angle);
    formData.append('pageMode', pageMode);
    if (pageMode === 'specific') formData.append('pageNumbers', pageNumbers);
    try {
      const { data } = await axios.post('/api/pdf/rotate', formData);
      startJob(data.jobId);
    } catch (err) { setError(err.response?.data?.error || 'Upload failed.'); }
    finally { setLoading(false); }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.downloadUrl; a.download = result.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleReset = () => { setFile(null); setAngle(90); setPageMode('all'); setPageNumbers(''); setError(''); resetJob(); };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><RotateCw size={20} className="text-red-600" /></div>
        <div><h1 className="text-2xl font-bold text-gray-900">Rotate Pages</h1><p className="text-gray-500 text-sm">Rotate PDF pages to the correct orientation</p></div>
      </div>

      {(error || jobError) && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error || jobError}</div>}

      {result && status === 'completed' ? (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><CheckCircle size={20} className="text-green-600" /></div>
            <div><p className="font-semibold text-gray-800">Pages rotated!</p><p className="text-sm text-gray-500">{result.filename}</p></div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 mb-5 grid grid-cols-2 gap-4">
            <div><p className="text-xs text-gray-500 mb-1">Original size</p><p className="font-semibold text-gray-700">{formatBytes(result.originalSize)}</p></div>
            <div><p className="text-xs text-gray-500 mb-1">New size</p><p className="font-semibold text-green-700">{formatBytes(result.size)}</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownload} className="btn-primary flex-1 flex items-center justify-center gap-2"><Download size={16} /> Download</button>
            <button onClick={handleReset} className="btn-secondary flex-1 flex items-center justify-center gap-2"><RefreshCw size={16} /> Rotate Another</button>
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
            <p className="text-sm font-semibold text-gray-700 mb-2">Rotation angle</p>
            <div className="flex gap-2">
              {[90, 180, 270].map(a => (
                <button
                  key={a}
                  onClick={() => setAngle(a)}
                  className={`format-btn ${angle === a ? 'format-btn-active' : 'format-btn-inactive'}`}
                >
                  {a}°
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Apply to</p>
            <div className="flex gap-2">
              {[{ value: 'all', label: 'All pages' }, { value: 'specific', label: 'Specific pages' }].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPageMode(opt.value)}
                  className={`format-btn ${pageMode === opt.value ? 'format-btn-active' : 'format-btn-inactive'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {pageMode === 'specific' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Page numbers</label>
              <input
                type="text"
                value={pageNumbers}
                onChange={(e) => setPageNumbers(e.target.value)}
                placeholder="e.g. 1, 3, 5-7"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          )}

          <JobStatus status={status} progress={progress} position={position} error={jobError} />

          <button onClick={handleRotate} disabled={!file || isProcessing} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <><RefreshCw size={16} className="animate-spin" /> Uploading...</>
              : isProcessing ? <><RefreshCw size={16} className="animate-spin" /> Processing...</>
              : <><RotateCw size={16} /> Rotate PDF</>}
          </button>
        </div>
      )}
    </div>
  );
}

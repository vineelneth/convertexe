import React, { useState } from 'react';
import axios from 'axios';
import { PackageOpen, Download, RefreshCw, CheckCircle, Info } from 'lucide-react';
import FileDropzone from '../../components/FileDropzone';
import JobStatus from '../../components/JobStatus';
import { useJobPoller } from '../../hooks/useJobPoller';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function CompressPdf() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { startJob, reset: resetJob, status, progress, position, result, error: hookError } = useJobPoller();

  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError = status === 'failed' ? (hookError || 'Compression failed') : '';

  const handleCompress = async () => {
    if (!file) return;
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { data } = await axios.post('/api/pdf/compress', formData);
      startJob(data.jobId);
    } catch (err) { setError(err.response?.data?.error || 'Upload failed.'); }
    finally { setLoading(false); }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.downloadUrl; a.download = result.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleReset = () => { setFile(null); setError(''); resetJob(); };

  const reduction = result ? Math.round((1 - result.size / result.originalSize) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><PackageOpen size={20} className="text-red-600" /></div>
        <div><h1 className="text-2xl font-bold text-gray-900">Compress PDF</h1><p className="text-gray-500 text-sm">Reduce PDF file size by optimizing structure</p></div>
      </div>

      {(error || jobError) && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error || jobError}</div>}

      {result && status === 'completed' ? (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><CheckCircle size={20} className="text-green-600" /></div>
            <div><p className="font-semibold text-gray-800">PDF compressed!</p><p className="text-sm text-gray-500">{result.filename}</p></div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 mb-5 grid grid-cols-3 gap-4">
            <div><p className="text-xs text-gray-500 mb-1">Original size</p><p className="font-semibold text-gray-700">{formatBytes(result.originalSize)}</p></div>
            <div><p className="text-xs text-gray-500 mb-1">New size</p><p className="font-semibold text-green-700">{formatBytes(result.size)}</p></div>
            <div><p className="text-xs text-gray-500 mb-1">Reduction</p><p className={`font-semibold ${reduction > 0 ? 'text-green-700' : 'text-gray-500'}`}>{reduction > 0 ? `-${reduction}%` : 'No change'}</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownload} className="btn-primary flex-1 flex items-center justify-center gap-2"><Download size={16} /> Download</button>
            <button onClick={handleReset} className="btn-secondary flex-1 flex items-center justify-center gap-2"><RefreshCw size={16} /> Compress Another</button>
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

          <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">Removes unused objects and compresses PDF structure. Most effective on PDFs created by office tools or exported with large metadata.</p>
          </div>

          <JobStatus status={status} progress={progress} position={position} error={jobError} />

          <button onClick={handleCompress} disabled={!file || isProcessing} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <><RefreshCw size={16} className="animate-spin" /> Uploading...</>
              : isProcessing ? <><RefreshCw size={16} className="animate-spin" /> Processing...</>
              : <><PackageOpen size={16} /> Compress PDF</>}
          </button>
        </div>
      )}
    </div>
  );
}

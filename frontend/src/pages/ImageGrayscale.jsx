import React, { useState } from 'react';
import axios from 'axios';
import { Contrast, Download, RefreshCw, CheckCircle } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import JobStatus from '../components/JobStatus';
import { useJobPoller } from '../hooks/useJobPoller';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function ImageGrayscale() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { startJob, reset: resetJob, status, progress, position, result } = useJobPoller();
  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError = status === 'failed' ? (result?.error || 'Operation failed') : '';

  const handleConvert = async () => {
    if (!file) return;
    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await axios.post('/api/image/grayscale', formData);
      startJob(data.jobId);
    } catch (err) {
      setError(err.response?.data?.error || 'Conversion failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.downloadUrl;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleReset = () => {
    setFile(null);
    setError('');
    resetJob();
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
          <Contrast size={20} className="text-slate-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Grayscale Converter</h1>
          <p className="text-gray-500 text-sm">Convert color images to black & white</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {result && status === 'completed' ? (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-800">Conversion complete!</p>
              <p className="text-sm text-gray-500">{result.filename}</p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-5 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Original size</p>
              <p className="font-semibold text-gray-700">{formatBytes(result.originalSize)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Output size</p>
              <p className="font-semibold text-green-700">{formatBytes(result.size)}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleDownload} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Download size={16} /> Download
            </button>
            <button onClick={handleReset} className="btn-secondary flex-1 flex items-center justify-center gap-2">
              <RefreshCw size={16} /> Convert Another
            </button>
          </div>
        </div>
      ) : (
        <div className="card space-y-6">
          <FileDropzone
            file={file}
            onFileChange={setFile}
            accept=".jpg,.jpeg,.png,.webp,.gif,.bmp,.tiff"
            label="Drag & drop a color image here"
          />

          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-5 h-5 rounded-full bg-red-400" />
                <div className="w-5 h-5 rounded-full bg-green-400" />
                <div className="w-5 h-5 rounded-full bg-blue-400" />
              </div>
              <span className="text-gray-500 text-sm">→</span>
              <div className="flex gap-1.5">
                <div className="w-5 h-5 rounded-full bg-gray-200" />
                <div className="w-5 h-5 rounded-full bg-gray-400" />
                <div className="w-5 h-5 rounded-full bg-gray-700" />
              </div>
              <span className="text-sm text-gray-600 font-medium ml-2">Color → Grayscale</span>
            </div>
          </div>

          <JobStatus status={status} progress={progress} position={position} error={jobError} />

          <button
            onClick={handleConvert}
            disabled={!file || isProcessing}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <><RefreshCw size={16} className="animate-spin" /> Converting...</>
            ) : (
              <><Contrast size={16} /> Convert to Grayscale</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

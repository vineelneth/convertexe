import React, { useState } from 'react';
import axios from 'axios';
import { RotateCw, Download, RefreshCw, CheckCircle, FlipHorizontal2 } from 'lucide-react';
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

export default function ImageRotate() {
  const [file, setFile] = useState(null);
  const [angle, setAngle] = useState(0);
  const [flip, setFlip] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { startJob, reset: resetJob, status, progress, position, result } = useJobPoller();
  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError = status === 'failed' ? (result?.error || 'Operation failed') : '';

  const handleProcess = async () => {
    if (!file || (angle === 0 && !flip)) return;
    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('angle', angle);
    if (flip) formData.append('flip', flip);

    try {
      const { data } = await axios.post('/api/image/rotate', formData);
      startJob(data.jobId);
    } catch (err) {
      setError(err.response?.data?.error || 'Processing failed. Please try again.');
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
    setAngle(0);
    setFlip('');
    setError('');
    resetJob();
  };

  const canProcess = file && (angle !== 0 || flip !== '');

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
          <RotateCw size={20} className="text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rotate & Flip</h1>
          <p className="text-gray-500 text-sm">Rotate or flip your images</p>
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
              <p className="font-semibold text-gray-800">Transform complete!</p>
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
              <RefreshCw size={16} /> Process Another
            </button>
          </div>
        </div>
      ) : (
        <div className="card space-y-6">
          <FileDropzone
            file={file}
            onFileChange={setFile}
            accept=".jpg,.jpeg,.png,.webp,.gif,.bmp,.tiff"
            label="Drag & drop an image here"
          />

          {/* Rotation */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Rotation:</p>
            <div className="flex gap-2 flex-wrap">
              {[
                { label: 'No rotation', val: 0 },
                { label: '90° CW', val: 90 },
                { label: '180°', val: 180 },
                { label: '270° CW', val: 270 }
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => setAngle(opt.val)}
                  className={`format-btn ${angle === opt.val ? 'format-btn-active' : 'format-btn-inactive'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Flip */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Flip:</p>
            <div className="flex gap-2">
              {[
                { label: 'No flip', val: '' },
                { label: 'Horizontal', val: 'horizontal' },
                { label: 'Vertical', val: 'vertical' }
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => setFlip(opt.val)}
                  className={`format-btn ${flip === opt.val ? 'format-btn-active' : 'format-btn-inactive'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <JobStatus status={status} progress={progress} position={position} error={jobError} />

          <button
            onClick={handleProcess}
            disabled={!canProcess || isProcessing}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <><RefreshCw size={16} className="animate-spin" /> Processing...</>
            ) : (
              <><RotateCw size={16} /> Apply Transform</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

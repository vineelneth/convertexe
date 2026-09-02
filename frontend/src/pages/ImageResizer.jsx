import React, { useState } from 'react';
import axios from 'axios';
import { Maximize2, Download, RefreshCw, CheckCircle } from 'lucide-react';
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

const PRESETS = [
  { label: 'HD (1280×720)', w: 1280, h: 720 },
  { label: 'FHD (1920×1080)', w: 1920, h: 1080 },
  { label: '2K (2560×1440)', w: 2560, h: 1440 },
  { label: '4K (3840×2160)', w: 3840, h: 2160 },
  { label: 'Square (1080×1080)', w: 1080, h: 1080 },
  { label: 'Twitter (1200×675)', w: 1200, h: 675 },
  { label: 'Instagram (1080×1350)', w: 1080, h: 1350 },
  { label: 'Thumbnail (320×180)', w: 320, h: 180 },
];

export default function ImageResizer() {
  const [file, setFile] = useState(null);
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [maintainAspect, setMaintainAspect] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { startJob, reset: resetJob, status, progress, position, result } = useJobPoller();
  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError = status === 'failed' ? (result?.error || 'Operation failed') : '';

  const applyPreset = (preset) => {
    setWidth(preset.w);
    setHeight(preset.h);
  };

  const handleResize = async () => {
    if (!file || (!width && !height)) return;
    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    if (width) formData.append('width', width);
    if (height) formData.append('height', height);
    formData.append('maintainAspectRatio', maintainAspect);

    try {
      const { data } = await axios.post('/api/image/resize', formData);
      startJob(data.jobId);
    } catch (err) {
      setError(err.response?.data?.error || 'Resize failed. Please try again.');
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
    setWidth('');
    setHeight('');
    setError('');
    resetJob();
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
          <Maximize2 size={20} className="text-teal-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Image Resizer</h1>
          <p className="text-gray-500 text-sm">Resize images to any dimension</p>
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
              <p className="font-semibold text-gray-800">Resize complete!</p>
              <p className="text-sm text-gray-500">{result.filename}</p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-5 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Original size</p>
              <p className="font-semibold text-gray-700">{formatBytes(result.originalSize)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">New size</p>
              <p className="font-semibold text-green-700">{formatBytes(result.size)}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleDownload} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Download size={16} /> Download
            </button>
            <button onClick={handleReset} className="btn-secondary flex-1 flex items-center justify-center gap-2">
              <RefreshCw size={16} /> Resize Another
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

          {/* Presets */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Presets:</p>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className="text-left text-xs px-3 py-2 border rounded-lg hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-gray-600 border-gray-200"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom dimensions */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Custom dimensions:</p>
            <div className="flex gap-3 items-center">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Width (px)</label>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  placeholder="e.g. 1920"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>
              <div className="text-gray-400 mt-5 font-bold">×</div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Height (px)</label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="e.g. 1080"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
          </div>

          {/* Aspect ratio */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setMaintainAspect(!maintainAspect)}
              className={`w-10 h-6 rounded-full transition-colors relative ${maintainAspect ? 'bg-indigo-600' : 'bg-gray-200'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${maintainAspect ? 'translate-x-5' : 'translate-x-1'}`} />
            </div>
            <span className="text-sm text-gray-700 font-medium">Maintain aspect ratio</span>
          </label>

          <JobStatus status={status} progress={progress} position={position} error={jobError} />

          <button
            onClick={handleResize}
            disabled={!file || (!width && !height) || isProcessing}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <><RefreshCw size={16} className="animate-spin" /> Resizing...</>
            ) : (
              <><Maximize2 size={16} /> Resize Image</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

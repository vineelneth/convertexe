import React, { useState } from 'react';
import axios from 'axios';
import { Minimize2, Download, RefreshCw, CheckCircle, Sliders, Target } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import JobStatus from '../components/JobStatus';
import { useJobPoller } from '../hooks/useJobPoller';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const PRESETS = [{ label: 'Low (40%)', val: 40 }, { label: 'Medium (70%)', val: 70 }, { label: 'High (85%)', val: 85 }, { label: 'Max (95%)', val: 95 }];

export default function ImageCompressor() {
  const [file, setFile]           = useState(null);
  const [mode, setMode]           = useState('quality');
  const [quality, setQuality]     = useState(80);
  const [targetSize, setTargetSize] = useState('');
  const [targetUnit, setTargetUnit] = useState('KB');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const { startJob, reset: resetJob, status, progress, position, result } = useJobPoller();

  const targetSizeKB = targetSize ? (targetUnit === 'MB' ? parseFloat(targetSize) * 1024 : parseFloat(targetSize)) : null;
  const isValid = file && (mode === 'quality' || (targetSize && parseFloat(targetSize) > 0));
  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError = status === 'failed' ? (result?.error || 'Compression failed') : '';
  const savings = result ? Math.max(0, Math.round((1 - result.size / result.originalSize) * 100)) : 0;

  const handleCompress = async () => {
    if (!isValid) return;
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('file', file);
    if (mode === 'quality') formData.append('quality', quality);
    else formData.append('targetSizeKB', targetSizeKB.toString());
    try {
      const { data } = await axios.post('/api/image/compress', formData);
      startJob(data.jobId);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed.');
    } finally { setLoading(false); }
  };

  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.downloadUrl; a.download = result.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleReset = () => { setFile(null); setQuality(80); setTargetSize(''); setError(''); resetJob(); };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-cyan-100 rounded-xl flex items-center justify-center"><Minimize2 size={20} className="text-cyan-600" /></div>
        <div><h1 className="text-2xl font-bold text-gray-900">Image Compressor</h1><p className="text-gray-500 text-sm">Reduce file size by quality or exact target size</p></div>
      </div>

      {(error || jobError) && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error || jobError}</div>}

      {result && status === 'completed' ? (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><CheckCircle size={20} className="text-green-600" /></div>
            <div><p className="font-semibold text-gray-800">Compression complete!</p>
              <p className="text-sm text-gray-500">{savings > 0 ? `Reduced by ${savings}%` : 'File processed'}{result.qualityUsed != null ? ` · Quality: ${result.qualityUsed}%` : ''}</p></div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 mb-5 grid grid-cols-3 gap-4">
            <div><p className="text-xs text-gray-500 mb-1">Original</p><p className="font-semibold text-gray-700">{formatBytes(result.originalSize)}</p></div>
            <div><p className="text-xs text-gray-500 mb-1">Compressed</p><p className="font-semibold text-green-700">{formatBytes(result.size)}</p></div>
            <div><p className="text-xs text-gray-500 mb-1">Saved</p><p className="font-bold text-indigo-700">{savings}%</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownload} className="btn-primary flex-1 flex items-center justify-center gap-2"><Download size={16} /> Download</button>
            <button onClick={handleReset} className="btn-secondary flex-1 flex items-center justify-center gap-2"><RefreshCw size={16} /> Compress Another</button>
          </div>
        </div>
      ) : (
        <div className="card space-y-6">
          <FileDropzone file={file} onFileChange={setFile} accept=".jpg,.jpeg,.png,.webp,.avif" label="Drag & drop an image here" />

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Compression mode:</p>
            <div className="grid grid-cols-2 gap-2">
              {[['quality', Sliders, 'By Quality', 'Adjust quality %'], ['targetSize', Target, 'By Target Size', 'Set exact output size']].map(([m, Icon, label, desc]) => (
                <button key={m} onClick={() => setMode(m)} className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 text-left transition-all ${mode === m ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-indigo-300'}`}>
                  <Icon size={16} /><div><p className="font-semibold text-sm">{label}</p><p className="text-xs text-gray-400">{desc}</p></div>
                </button>
              ))}
            </div>
          </div>

          {mode === 'quality' && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm font-semibold text-gray-700">Quality</p>
                <span className={`text-sm font-bold px-2 py-0.5 rounded ${quality >= 80 ? 'text-green-700 bg-green-100' : quality >= 50 ? 'text-yellow-700 bg-yellow-100' : 'text-red-700 bg-red-100'}`}>{quality}%</span>
              </div>
              <input type="range" min="1" max="100" value={quality} onChange={(e) => setQuality(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
              <div className="flex justify-between text-xs text-gray-400 mt-1"><span>Smallest file</span><span>Best quality</span></div>
              <div className="flex gap-2 flex-wrap mt-3">
                {PRESETS.map(p => (
                  <button key={p.val} onClick={() => setQuality(p.val)} className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${quality === p.val ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-indigo-300'}`}>{p.label}</button>
                ))}
              </div>
            </div>
          )}

          {mode === 'targetSize' && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Target output size:</p>
              <div className="flex gap-2">
                <input type="number" min="1" step="any" value={targetSize} onChange={(e) => setTargetSize(e.target.value)} placeholder="e.g. 200"
                  className="flex-1 border-2 border-gray-200 rounded-lg px-4 py-3 text-sm font-medium focus:outline-none focus:border-indigo-500 transition-colors" />
                <select value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} className="border-2 border-gray-200 rounded-lg px-4 py-3 text-sm font-semibold text-gray-700 focus:outline-none focus:border-indigo-500 bg-white cursor-pointer">
                  <option value="KB">KB</option><option value="MB">MB</option>
                </select>
              </div>
              {file && targetSize && parseFloat(targetSize) > 0 && (
                <p className="text-xs text-gray-400 mt-2">Original: {formatBytes(file.size)} → Target: {formatBytes(targetSizeKB * 1024)}{targetSizeKB * 1024 >= file.size && <span className="text-amber-500 ml-1">— must be smaller than original</span>}</p>
              )}
            </div>
          )}

          <JobStatus status={status} progress={progress} position={position} error={jobError} />

          <button onClick={handleCompress} disabled={!isValid || isProcessing} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <><RefreshCw size={16} className="animate-spin" /> Uploading...</>
              : isProcessing ? <><RefreshCw size={16} className="animate-spin" /> Processing...</>
              : <><Minimize2 size={16} /> Compress Image</>}
          </button>
        </div>
      )}
    </div>
  );
}

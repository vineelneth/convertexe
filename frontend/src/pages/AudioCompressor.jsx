import React, { useState } from 'react';
import axios from 'axios';
import { Volume2, Download, RefreshCw, CheckCircle, Sliders, Target } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import JobStatus from '../components/JobStatus';
import { useJobPoller } from '../hooks/useJobPoller';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const BITRATES = [
  { label: '320 kbps', value: '320k', desc: 'Studio quality' },
  { label: '256 kbps', value: '256k', desc: 'High quality' },
  { label: '192 kbps', value: '192k', desc: 'Very good' },
  { label: '128 kbps', value: '128k', desc: 'Good quality' },
  { label: '96 kbps',  value: '96k',  desc: 'Decent quality' },
  { label: '64 kbps',  value: '64k',  desc: 'Small file' },
];

export default function AudioCompressor() {
  const [file, setFile]           = useState(null);
  const [mode, setMode]           = useState('bitrate');
  const [bitrate, setBitrate]     = useState('128k');
  const [targetSize, setTargetSize] = useState('');
  const [targetUnit, setTargetUnit] = useState('KB');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const { startJob, reset: resetJob, status, progress, position, result } = useJobPoller();

  const targetSizeKB = targetSize ? (targetUnit === 'MB' ? parseFloat(targetSize) * 1024 : parseFloat(targetSize)) : null;
  const isValid = file && (mode === 'bitrate' || (targetSize && parseFloat(targetSize) > 0));
  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError = status === 'failed' ? (result?.error || 'Compression failed') : '';
  const savings = result ? Math.max(0, Math.round((1 - result.size / result.originalSize) * 100)) : 0;

  const handleCompress = async () => {
    if (!isValid) return;
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('file', file);
    if (mode === 'bitrate') formData.append('bitrate', bitrate);
    else formData.append('targetSizeKB', targetSizeKB.toString());
    try {
      const { data } = await axios.post('/api/audio/compress', formData);
      startJob(data.jobId);
    } catch (err) { setError(err.response?.data?.error || 'Upload failed.'); }
    finally { setLoading(false); }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.downloadUrl; a.download = result.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleReset = () => { setFile(null); setBitrate('128k'); setTargetSize(''); setError(''); resetJob(); };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center"><Volume2 size={20} className="text-purple-600" /></div>
        <div><h1 className="text-2xl font-bold text-gray-900">Audio Compressor</h1><p className="text-gray-500 text-sm">Reduce audio file size by bitrate or target size</p></div>
      </div>

      {(error || jobError) && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error || jobError}</div>}

      {result && status === 'completed' ? (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><CheckCircle size={20} className="text-green-600" /></div>
            <div><p className="font-semibold text-gray-800">Compression complete!</p>
              <p className="text-sm text-gray-500">{savings > 0 ? `Reduced by ${savings}%` : 'Processed'}{result.bitrateUsed ? ` · ${result.bitrateUsed}` : ''}</p></div>
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
          <FileDropzone file={file} onFileChange={setFile} accept=".mp3,.wav,.aac,.flac,.ogg,.oga,.m4a,.m4b,.wma,.webm,.opus,.mp1,.mp2,.mpc,.amr,.awb,.3gp,.aiff,.alac,.au,.gsm,.tta,.voc,.vox,.wv,.ape,.ra,.rm,.raw,.rf64,.sln,.8svx"
            supportedLabel="35+ audio formats (MP3, WAV, FLAC, AAC, OGG, OPUS, AIFF, APE, MPC, RA, WV, AMR …)" label="Drag & drop an audio file here" />

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Compression mode:</p>
            <div className="grid grid-cols-2 gap-2">
              {[['bitrate', Sliders, 'By Bitrate', 'Choose audio quality'], ['targetSize', Target, 'By Target Size', 'Set exact output size']].map(([m, Icon, label, desc]) => (
                <button key={m} onClick={() => setMode(m)} className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 text-left transition-all ${mode === m ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-indigo-300'}`}>
                  <Icon size={16} /><div><p className="font-semibold text-sm">{label}</p><p className="text-xs text-gray-400">{desc}</p></div>
                </button>
              ))}
            </div>
          </div>

          {mode === 'bitrate' && (
            <div className="grid grid-cols-2 gap-2">
              {BITRATES.map(b => (
                <button key={b.value} onClick={() => setBitrate(b.value)} className={`px-4 py-3 rounded-lg border-2 text-left transition-all ${bitrate === b.value ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'}`}>
                  <p className={`font-semibold text-sm ${bitrate === b.value ? 'text-indigo-700' : 'text-gray-700'}`}>{b.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{b.desc}</p>
                </button>
              ))}
            </div>
          )}

          {mode === 'targetSize' && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Target output size:</p>
              <div className="flex gap-2">
                <input type="number" min="1" step="any" value={targetSize} onChange={(e) => setTargetSize(e.target.value)} placeholder="e.g. 500"
                  className="flex-1 border-2 border-gray-200 rounded-lg px-4 py-3 text-sm font-medium focus:outline-none focus:border-indigo-500 transition-colors" />
                <select value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} className="border-2 border-gray-200 rounded-lg px-4 py-3 text-sm font-semibold text-gray-700 focus:outline-none focus:border-indigo-500 bg-white cursor-pointer">
                  <option value="KB">KB</option><option value="MB">MB</option>
                </select>
              </div>
              {file && targetSize && parseFloat(targetSize) > 0 && (
                <p className="text-xs text-gray-400 mt-2">Original: {formatBytes(file.size)} → Target: {formatBytes(targetSizeKB * 1024)}{targetSizeKB * 1024 >= file.size && <span className="text-amber-500 ml-1">— must be smaller than original</span>}</p>
              )}
              <p className="text-xs text-gray-400 mt-2">Bitrate is auto-calculated from your audio duration. Min 32 kbps.</p>
            </div>
          )}

          <JobStatus status={status} progress={progress} position={position} error={jobError} />

          <button onClick={handleCompress} disabled={!isValid || isProcessing} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <><RefreshCw size={16} className="animate-spin" /> Uploading...</>
              : isProcessing ? <><RefreshCw size={16} className="animate-spin" /> Processing...</>
              : <><Volume2 size={16} /> Compress Audio</>}
          </button>
        </div>
      )}
    </div>
  );
}

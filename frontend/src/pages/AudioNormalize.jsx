import React, { useState } from 'react';
import axios from 'axios';
import { Activity, Download, RefreshCw, CheckCircle } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import JobStatus from '../components/JobStatus';
import { useJobPoller } from '../hooks/useJobPoller';

const ALL_INPUT_EXTS = '.mp3,.wav,.aac,.flac,.ogg,.oga,.m4a,.m4b,.wma,.webm,.opus,.mp1,.mp2,.mpc,.amr,.awb,.3gp,.aiff,.alac,.au,.gsm,.tta,.voc,.vox,.wv,.ape,.ra,.rm,.raw,.rf64,.sln,.8svx';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const PRESETS = [
  { label: 'YouTube / Podcasts', value: -14, desc: '-14 LUFS — loud and clear' },
  { label: 'Spotify / Music',    value: -16, desc: '-16 LUFS — streaming standard' },
  { label: 'EBU R128 Broadcast', value: -23, desc: '-23 LUFS — TV/radio standard' },
  { label: 'Custom',             value: null, desc: 'Set your own target' },
];

export default function AudioNormalize() {
  const [file, setFile]           = useState(null);
  const [preset, setPreset]       = useState(PRESETS[0]);
  const [customLUFS, setCustomLUFS] = useState('-14');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const { startJob, reset: resetJob, status, progress, position, result } = useJobPoller();

  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError = status === 'failed' ? (result?.error || 'Normalization failed') : '';
  const targetLUFS = preset.value !== null ? preset.value : parseFloat(customLUFS) || -14;

  const handleNormalize = async () => {
    if (!file) return;
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('targetLUFS', String(targetLUFS));
    try {
      const { data } = await axios.post('/api/audio/normalize', formData);
      startJob(data.jobId);
    } catch (err) { setError(err.response?.data?.error || 'Upload failed.'); }
    finally { setLoading(false); }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.downloadUrl; a.download = result.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleReset = () => { setFile(null); setPreset(PRESETS[0]); setCustomLUFS('-14'); setError(''); resetJob(); };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center"><Activity size={20} className="text-indigo-600" /></div>
        <div><h1 className="text-2xl font-bold text-gray-900">Normalize Audio</h1><p className="text-gray-500 text-sm">Balance loudness to a target LUFS level</p></div>
      </div>

      {(error || jobError) && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">{error || jobError}</div>}

      {result && status === 'completed' ? (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><CheckCircle size={20} className="text-green-600" /></div>
            <div><p className="font-semibold text-gray-800">Normalization complete!</p><p className="text-sm text-gray-500">{result.filename} · Target {targetLUFS} LUFS</p></div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 mb-5 grid grid-cols-2 gap-4">
            <div><p className="text-xs text-gray-500 mb-1">Original size</p><p className="font-semibold text-gray-700">{formatBytes(result.originalSize)}</p></div>
            <div><p className="text-xs text-gray-500 mb-1">Output size</p><p className="font-semibold text-green-700">{formatBytes(result.size)}</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownload} className="btn-primary flex-1 flex items-center justify-center gap-2"><Download size={16} /> Download</button>
            <button onClick={handleReset} className="btn-secondary flex-1 flex items-center justify-center gap-2"><RefreshCw size={16} /> Normalize Another</button>
          </div>
        </div>
      ) : (
        <div className="card space-y-6">
          <FileDropzone file={file} onFileChange={setFile} accept={ALL_INPUT_EXTS}
            supportedLabel="35+ audio formats (MP3, WAV, FLAC, AAC, OGG …)"
            label="Drag & drop an audio file here" />

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Target loudness:</p>
            <div className="space-y-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setPreset(p)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 text-left transition-all ${
                    preset.label === p.label
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  <div>
                    <p className={`font-semibold text-sm ${preset.label === p.label ? 'text-indigo-700' : 'text-gray-700'}`}>{p.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{p.desc}</p>
                  </div>
                  {p.value !== null && (
                    <span className={`text-sm font-bold ${preset.label === p.label ? 'text-indigo-600' : 'text-gray-400'}`}>{p.value} LUFS</span>
                  )}
                </button>
              ))}
            </div>

            {preset.value === null && (
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="number"
                  min={-70}
                  max={0}
                  step={0.5}
                  value={customLUFS}
                  onChange={(e) => setCustomLUFS(e.target.value)}
                  className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="-14"
                />
                <span className="text-sm font-semibold text-gray-500">LUFS</span>
              </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-600 leading-relaxed">
            Normalization uses the EBU R128 loudness standard (loudnorm). It adjusts the perceived volume of your audio without clipping, making it consistent across different playback systems.
          </div>

          <JobStatus status={status} progress={progress} position={position} error={jobError} />

          <button onClick={handleNormalize} disabled={!file || isProcessing} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <><RefreshCw size={16} className="animate-spin" /> Uploading...</>
              : isProcessing ? <><RefreshCw size={16} className="animate-spin" /> Processing...</>
              : <><Activity size={16} /> Normalize Audio</>}
          </button>
        </div>
      )}
    </div>
  );
}

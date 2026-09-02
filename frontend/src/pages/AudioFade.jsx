import React, { useState } from 'react';
import axios from 'axios';
import { Download, RefreshCw, CheckCircle } from 'lucide-react';
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

const FADE_STEPS = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 7, 10];

function FadeSlider({ label, desc, value, onChange }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">{label}</p>
          <p className="text-xs text-gray-400">{desc}</p>
        </div>
        <span className={`text-sm font-bold px-3 py-1 rounded-lg ${value > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-400'}`}>
          {value === 0 ? 'Off' : `${value}s`}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={FADE_STEPS.length - 1}
        step={1}
        value={FADE_STEPS.indexOf(value) === -1 ? 0 : FADE_STEPS.indexOf(value)}
        onChange={(e) => onChange(FADE_STEPS[parseInt(e.target.value)])}
        className="w-full accent-indigo-600"
      />
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>Off</span><span>5s</span><span>10s</span>
      </div>
    </div>
  );
}

export default function AudioFade() {
  const [file, setFile]       = useState(null);
  const [fadeIn, setFadeIn]   = useState(2);
  const [fadeOut, setFadeOut] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const { startJob, reset: resetJob, status, progress, position, result } = useJobPoller();

  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError = status === 'failed' ? (result?.error || 'Fade failed') : '';
  const isValid = file && (fadeIn > 0 || fadeOut > 0);

  const handleFade = async () => {
    if (!isValid) return;
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fadeIn', String(fadeIn));
    formData.append('fadeOut', String(fadeOut));
    try {
      const { data } = await axios.post('/api/audio/fade', formData);
      startJob(data.jobId);
    } catch (err) { setError(err.response?.data?.error || 'Upload failed.'); }
    finally { setLoading(false); }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.downloadUrl; a.download = result.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleReset = () => { setFile(null); setFadeIn(2); setFadeOut(2); setError(''); resetJob(); };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600">
            <path d="M2 12h2l3-8 4 16 3-10 2 6h6" />
          </svg>
        </div>
        <div><h1 className="text-2xl font-bold text-gray-900">Audio Fade</h1><p className="text-gray-500 text-sm">Add smooth fade-in and fade-out effects</p></div>
      </div>

      {(error || jobError) && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">{error || jobError}</div>}

      {result && status === 'completed' ? (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><CheckCircle size={20} className="text-green-600" /></div>
            <div><p className="font-semibold text-gray-800">Fade applied!</p><p className="text-sm text-gray-500">{result.filename}</p></div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 mb-5 grid grid-cols-2 gap-4">
            <div><p className="text-xs text-gray-500 mb-1">Original size</p><p className="font-semibold text-gray-700">{formatBytes(result.originalSize)}</p></div>
            <div><p className="text-xs text-gray-500 mb-1">Output size</p><p className="font-semibold text-green-700">{formatBytes(result.size)}</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownload} className="btn-primary flex-1 flex items-center justify-center gap-2"><Download size={16} /> Download</button>
            <button onClick={handleReset} className="btn-secondary flex-1 flex items-center justify-center gap-2"><RefreshCw size={16} /> Fade Another</button>
          </div>
        </div>
      ) : (
        <div className="card space-y-6">
          <FileDropzone file={file} onFileChange={setFile} accept={ALL_INPUT_EXTS}
            supportedLabel="35+ audio formats (MP3, WAV, FLAC, AAC, OGG …)"
            label="Drag & drop an audio file here" />

          <FadeSlider
            label="Fade In"
            desc="Volume gradually rises from silence at the start"
            value={fadeIn}
            onChange={setFadeIn}
          />

          <FadeSlider
            label="Fade Out"
            desc="Volume gradually drops to silence at the end"
            value={fadeOut}
            onChange={setFadeOut}
          />

          {fadeIn === 0 && fadeOut === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2">
              Enable at least one fade effect above.
            </p>
          )}

          <JobStatus status={status} progress={progress} position={position} error={jobError} />

          <button onClick={handleFade} disabled={!isValid || isProcessing} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <><RefreshCw size={16} className="animate-spin" /> Uploading...</>
              : isProcessing ? <><RefreshCw size={16} className="animate-spin" /> Processing...</>
              : <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12h2l3-8 4 16 3-10 2 6h6" />
                  </svg>
                  Apply Fade
                </>}
          </button>
        </div>
      )}
    </div>
  );
}

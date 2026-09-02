import React, { useState } from 'react';
import axios from 'axios';
import { Music, Download, RefreshCw, CheckCircle } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import JobStatus from '../components/JobStatus';
import { useJobPoller } from '../hooks/useJobPoller';

const FORMAT_GROUPS = [
  { label: 'Popular',         formats: ['mp3', 'aac', 'wav', 'ogg', 'm4a', 'flac', 'opus'] },
  { label: 'Lossless',        formats: ['alac', 'aiff', 'tta', 'wv'] },
  { label: 'Web / Streaming', formats: ['webm', 'oga', 'mp2', 'wma'] },
  { label: 'Mobile / Voice',  formats: ['amr', 'awb', 'gsm', '3gp'] },
  { label: 'Other',           formats: ['m4b', 'au', 'voc'] },
];

const ALL_INPUT_EXTS = '.mp3,.wav,.aac,.flac,.ogg,.oga,.m4a,.m4b,.wma,.webm,.opus,.mp1,.mp2,.mpc,.amr,.awb,.3gp,.aiff,.alac,.au,.gsm,.tta,.voc,.vox,.wv,.ape,.ra,.rm,.raw,.rf64,.sln,.8svx';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function AudioConverter() {
  const [file, setFile]       = useState(null);
  const [format, setFormat]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const { startJob, reset: resetJob, status, progress, position, result } = useJobPoller();

  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError = status === 'failed' ? (result?.error || 'Conversion failed') : '';

  const handleConvert = async () => {
    if (!file || !format) return;
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('file', file); formData.append('format', format);
    try {
      const { data } = await axios.post('/api/audio/convert', formData);
      startJob(data.jobId);
    } catch (err) { setError(err.response?.data?.error || 'Upload failed.'); }
    finally { setLoading(false); }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.downloadUrl; a.download = result.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleReset = () => { setFile(null); setFormat(''); setError(''); resetJob(); };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center"><Music size={20} className="text-green-600" /></div>
        <div><h1 className="text-2xl font-bold text-gray-900">Audio Converter</h1><p className="text-gray-500 text-sm">Convert between 35+ audio formats</p></div>
      </div>

      {(error || jobError) && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error || jobError}</div>}

      {result && status === 'completed' ? (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><CheckCircle size={20} className="text-green-600" /></div>
            <div><p className="font-semibold text-gray-800">Conversion complete!</p><p className="text-sm text-gray-500">{result.filename}</p></div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 mb-5 grid grid-cols-2 gap-4">
            <div><p className="text-xs text-gray-500 mb-1">Original size</p><p className="font-semibold text-gray-700">{formatBytes(result.originalSize)}</p></div>
            <div><p className="text-xs text-gray-500 mb-1">New size</p><p className="font-semibold text-green-700">{formatBytes(result.size)}</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownload} className="btn-primary flex-1 flex items-center justify-center gap-2"><Download size={16} /> Download</button>
            <button onClick={handleReset} className="btn-secondary flex-1 flex items-center justify-center gap-2"><RefreshCw size={16} /> Convert Another</button>
          </div>
        </div>
      ) : (
        <div className="card space-y-6">
          <FileDropzone
            file={file}
            onFileChange={setFile}
            accept={ALL_INPUT_EXTS}
            supportedLabel="35+ audio formats (MP3, WAV, FLAC, AAC, OGG, OPUS, AIFF, APE, MPC, RA, WV, AMR …)"
            label="Drag & drop an audio file here"
          />

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Convert to:</p>
            <div className="space-y-3">
              {FORMAT_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{group.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.formats.map(f => (
                      <button
                        key={f}
                        onClick={() => setFormat(f)}
                        className={`format-btn ${format === f ? 'format-btn-active' : 'format-btn-inactive'}`}
                      >
                        {f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <JobStatus status={status} progress={progress} position={position} error={jobError} />

          <button onClick={handleConvert} disabled={!file || !format || isProcessing} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <><RefreshCw size={16} className="animate-spin" /> Uploading...</>
              : isProcessing ? <><RefreshCw size={16} className="animate-spin" /> Processing...</>
              : <><Music size={16} /> Convert Audio</>}
          </button>
        </div>
      )}
    </div>
  );
}

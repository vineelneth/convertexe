import React, { useState } from 'react';
import axios from 'axios';
import { Unlock, Download, RefreshCw, CheckCircle } from 'lucide-react';
import FileDropzone from '../../components/FileDropzone';
import JobStatus from '../../components/JobStatus';
import { useJobPoller } from '../../hooks/useJobPoller';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function checkPdfEncrypted(file) {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await axios.post('/api/pdf/check-encrypted', formData);
  return data.encrypted;
}

export default function UnlockPdf() {
  const [file, setFile] = useState(null);
  const [isEncrypted, setIsEncrypted] = useState(null); // null=unchecked, true=encrypted, false=not encrypted
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { startJob, reset: resetJob, status, progress, position, result, error: hookError } = useJobPoller();

  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError = status === 'failed' ? (hookError || 'Unlock failed') : '';

  const handleFileChange = async (f) => {
    setFile(f);
    setPassword('');
    setError('');
    setIsEncrypted(null);
    if (!f) return;
    try {
      const encrypted = await checkPdfEncrypted(f);
      setIsEncrypted(encrypted);
    } catch {
      setIsEncrypted(null);
    }
  };

  const handleUnlock = async () => {
    if (!file || !password) return;
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('password', password);
    try {
      const { data } = await axios.post('/api/pdf/unlock', formData);
      startJob(data.jobId);
    } catch (err) { setError(err.response?.data?.error || 'Upload failed.'); }
    finally { setLoading(false); }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.downloadUrl; a.download = result.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleReset = () => {
    setFile(null); setPassword(''); setError(''); setIsEncrypted(null); resetJob();
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
          <Unlock size={20} className="text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Unlock PDF</h1>
          <p className="text-gray-500 text-sm">Remove password protection from a PDF</p>
        </div>
      </div>

      {(error || jobError) && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
          {error || jobError}
        </div>
      )}

      {result && status === 'completed' ? (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-800">PDF unlocked!</p>
              <p className="text-sm text-gray-500">Password removed successfully</p>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 mb-5 grid grid-cols-2 gap-4">
            <div><p className="text-xs text-gray-500 mb-1">Original size</p><p className="font-semibold text-gray-700">{formatBytes(result.originalSize)}</p></div>
            <div><p className="text-xs text-gray-500 mb-1">Unlocked size</p><p className="font-semibold text-green-700">{formatBytes(result.size)}</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownload} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Download size={16} /> Download
            </button>
            <button onClick={handleReset} className="btn-secondary flex-1 flex items-center justify-center gap-2">
              <RefreshCw size={16} /> Unlock Another
            </button>
          </div>
        </div>
      ) : (
        <div className="card space-y-5">
          <FileDropzone
            file={file}
            onFileChange={handleFileChange}
            accept=".pdf"
            label="Drop your protected PDF here"
            supportedLabel="PDF files only"
          />

          {/* Not encrypted warning */}
          {isEncrypted === false && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm font-medium">
              This PDF is not password-protected — there is nothing to unlock.
            </div>
          )}

          {/* Password field — only shown when file is confirmed encrypted */}
          {isEncrypted === true && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">PDF Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                placeholder="Enter the current password"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1.5">The correct password is required to remove protection.</p>
            </div>
          )}

          <JobStatus status={status} progress={progress} position={position} error={jobError} />

          <button
            onClick={handleUnlock}
            disabled={!file || isEncrypted !== true || !password || isProcessing}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? <><RefreshCw size={16} className="animate-spin" /> Uploading...</>
              : isProcessing ? <><RefreshCw size={16} className="animate-spin" /> Removing password...</>
              : <><Unlock size={16} /> Remove Password</>}
          </button>
        </div>
      )}
    </div>
  );
}

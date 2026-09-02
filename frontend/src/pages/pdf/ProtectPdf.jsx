import React, { useState } from 'react';
import axios from 'axios';
import { Lock, Download, RefreshCw, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
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

export default function ProtectPdf() {
  const [file, setFile] = useState(null);
  const [isEncrypted, setIsEncrypted] = useState(null); // null=no file, true=already protected, false=clean
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { startJob, reset: resetJob, status, progress, position, result, error: hookError } = useJobPoller();

  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError = status === 'failed' ? (hookError || 'Protection failed') : '';

  const handleFileChange = async (f) => {
    setFile(f);
    setPassword(''); setConfirm('');
    setError(''); setIsEncrypted(null);
    if (!f) return;
    try {
      const encrypted = await checkPdfEncrypted(f);
      setIsEncrypted(encrypted);
    } catch {
      setIsEncrypted(null);
    }
  };

  const handleProtect = async () => {
    if (!file || !password) return;
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('password', password);
    try {
      const { data } = await axios.post('/api/pdf/protect', formData);
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
    setFile(null); setPassword(''); setConfirm(''); setError(''); setIsEncrypted(null); resetJob();
  };

  // Show password fields when no file yet (null) or file is clean (false). Hide when already encrypted (true).
  const showPasswordFields = isEncrypted !== true;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
          <Lock size={20} className="text-red-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Protect PDF</h1>
          <p className="text-gray-500 text-sm">Password-protect your PDF document</p>
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
              <p className="font-semibold text-gray-800">PDF protected!</p>
              <p className="text-sm text-gray-500">{result.filename}</p>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 mb-5 grid grid-cols-2 gap-4">
            <div><p className="text-xs text-gray-500 mb-1">Original size</p><p className="font-semibold text-gray-700">{formatBytes(result.originalSize)}</p></div>
            <div><p className="text-xs text-gray-500 mb-1">Protected size</p><p className="font-semibold text-green-700">{formatBytes(result.size)}</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownload} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Download size={16} /> Download
            </button>
            <button onClick={handleReset} className="btn-secondary flex-1 flex items-center justify-center gap-2">
              <RefreshCw size={16} /> Protect Another
            </button>
          </div>
        </div>
      ) : (
        <div className="card space-y-5">
          <FileDropzone
            file={file}
            onFileChange={handleFileChange}
            accept=".pdf"
            label="Drag & drop a PDF here"
            supportedLabel="PDF files only"
          />

          {/* Already protected warning */}
          {isEncrypted === true && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold mb-0.5">This PDF is already password-protected.</p>
              <p className="text-amber-700">
                First{' '}
                <Link to="/pdf/unlock" className="underline font-semibold text-amber-800 hover:text-amber-900">
                  remove the existing password
                </Link>
                , then come back here to set a new one.
              </p>
            </div>
          )}

          {/* Password fields — hidden when file is already encrypted */}
          {showPasswordFields && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter a password"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">256-bit AES encryption will be applied.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Confirm password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter the password"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </>
          )}

          <JobStatus status={status} progress={progress} position={position} error={jobError} />

          <button
            onClick={handleProtect}
            disabled={!file || isEncrypted === true || !password || !confirm || isProcessing}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? <><RefreshCw size={16} className="animate-spin" /> Uploading...</>
              : isProcessing ? <><RefreshCw size={16} className="animate-spin" /> Processing...</>
              : <><Lock size={16} /> Protect PDF</>}
          </button>
        </div>
      )}
    </div>
  );
}

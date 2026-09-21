import React, { useRef, useState } from 'react';
import { Upload, FileCheck, X } from 'lucide-react';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function FileDropzone({ file, onFileChange, accept, label, supportedLabel }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) onFileChange(dropped);
  };
  const handleClear = (e) => {
    e.stopPropagation();
    onFileChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div
      onClick={() => !file && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer select-none
        ${dragging
          ? 'border-indigo-500 bg-indigo-950/30 scale-[1.01]'
          : file
            ? 'border-emerald-700 bg-emerald-950/20 cursor-default'
            : 'border-slate-700 bg-slate-800/30 hover:border-indigo-600 hover:bg-indigo-950/20'
        }`}
      style={{ minHeight: '160px' }}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={e => e.target.files[0] && onFileChange(e.target.files[0])} />

      <div className="flex flex-col items-center justify-center p-6 sm:p-10 text-center">
        {file ? (
          <>
            <div className="w-11 h-11 sm:w-14 sm:h-14 bg-emerald-900/40 rounded-2xl flex items-center justify-center mb-3 shadow-sm">
              <FileCheck size={22} className="text-emerald-400" />
            </div>
            <p className="font-semibold text-slate-200 truncate max-w-[200px] sm:max-w-xs">{file.name}</p>
            <p className="text-slate-500 text-sm mt-1">{formatBytes(file.size)}</p>
            <button
              onClick={handleClear}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
            >
              <X size={12} /> Remove
            </button>
          </>
        ) : (
          <>
            <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mb-3 sm:mb-4 transition-colors shadow-sm
              ${dragging ? 'bg-indigo-900/50' : 'bg-slate-800 border border-slate-700'}`}>
              <Upload size={22} className={dragging ? 'text-indigo-400' : 'text-slate-500'} />
            </div>
            <p className="font-semibold text-slate-300 text-base">{label || 'Drop your file here'}</p>
            <p className="text-slate-500 text-sm mt-1">or <span className="text-indigo-400 font-semibold">browse files</span></p>
            {(supportedLabel || accept) && (
              <p className="text-xs text-slate-500 mt-3 bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700">
                {supportedLabel || accept.replace(/\./g, '').toUpperCase()}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

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
          ? 'border-indigo-400 bg-indigo-50 scale-[1.01]'
          : file
            ? 'border-emerald-300 bg-emerald-50 cursor-default'
            : 'border-gray-200 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/50'
        }`}
      style={{ minHeight: '160px' }}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={e => e.target.files[0] && onFileChange(e.target.files[0])} />

      <div className="flex flex-col items-center justify-center p-10 text-center">
        {file ? (
          <>
            <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mb-3 shadow-sm">
              <FileCheck size={26} className="text-emerald-600" />
            </div>
            <p className="font-semibold text-gray-800 truncate max-w-xs">{file.name}</p>
            <p className="text-gray-400 text-sm mt-1">{formatBytes(file.size)}</p>
            <button
              onClick={handleClear}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
            >
              <X size={12} /> Remove
            </button>
          </>
        ) : (
          <>
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-colors shadow-sm
              ${dragging ? 'bg-indigo-100' : 'bg-white border border-gray-200'}`}>
              <Upload size={28} className={dragging ? 'text-indigo-500' : 'text-gray-400'} />
            </div>
            <p className="font-semibold text-gray-700 text-base">{label || 'Drop your file here'}</p>
            <p className="text-gray-400 text-sm mt-1">or <span className="text-indigo-600 font-semibold">browse files</span></p>
            {(supportedLabel || accept) && (
              <p className="text-xs text-gray-400 mt-3 bg-white px-3 py-1 rounded-full border border-gray-100">
                {supportedLabel || accept.replace(/\./g, '').toUpperCase()}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

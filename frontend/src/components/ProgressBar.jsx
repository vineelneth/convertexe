import React from 'react';

export default function ProgressBar({ progress }) {
  return (
    <div className="h-2 bg-indigo-100 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

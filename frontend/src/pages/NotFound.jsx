import React from 'react';
import { Link } from 'react-router-dom';
import { Home, Zap } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto text-center py-24">
      <div className="w-16 h-16 bg-indigo-900/40 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <Zap size={28} className="text-indigo-400" />
      </div>
      <h1 className="text-5xl font-extrabold text-white mb-3">404</h1>
      <p className="text-slate-400 mb-8">This page doesn't exist.</p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors"
      >
        <Home size={16} /> Back to Home
      </Link>
    </div>
  );
}

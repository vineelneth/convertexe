import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useLocation } from 'react-router-dom';

let viewsPosted = false;
import { Zap, ChevronLeft } from 'lucide-react';

export default function Layout({ children }) {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const [views, setViews] = useState(null);

  useEffect(() => {
    if (!isHome || viewsPosted) return;
    viewsPosted = true;
    axios.post('/api/views').then(({ data }) => setViews(data.count)).catch(() => {});
  }, [isHome]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 no-underline">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center shadow-sm">
              <Zap size={15} className="text-white" />
            </div>
            <span className="font-extrabold text-lg bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent tracking-tight">
              Convertexe
            </span>
          </Link>

          {!isHome && (
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-indigo-600 transition-colors no-underline bg-gray-50 hover:bg-indigo-50 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-indigo-200"
            >
              <ChevronLeft size={14} /> All Tools
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 px-4 py-6 sm:py-10 w-full">
        {children}
      </main>

      <footer className="border-t border-gray-100 bg-white py-4 text-center text-xs text-gray-400 space-y-1">
        <p>Convertexe — Files are automatically deleted after processing</p>
        <p className="flex items-center justify-center gap-3">
          {views !== null && (
            <span>{views.toLocaleString()} visits</span>
          )}
          {views !== null && <span className="text-gray-200">|</span>}
          <span>
            Found a bug or issue?{' '}
            <a
              href="https://mail.google.com/mail/?view=cm&to=samavineel04@gmail.com&su=Convertexe%20Bug%20Report"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-500 hover:text-indigo-700 transition-colors"
            >
              support email
            </a>
          </span>
        </p>
      </footer>
    </div>
  );
}

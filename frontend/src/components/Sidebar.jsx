import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Home, Image, Minimize2, Maximize2, RotateCw, Contrast,
  Music, Volume2, X, Zap,
  ImagePlus, FilePlus2, Scissors, Trash2, PackageOpen, Lock, PenLine, FileImage
} from 'lucide-react';

const navSections = [
  {
    label: null,
    items: [
      { to: '/', label: 'Home', icon: Home, exact: true }
    ]
  },
  {
    label: 'Image Tools',
    items: [
      { to: '/image/convert',   label: 'Image Converter', icon: Image },
      { to: '/image/compress',  label: 'Compressor',      icon: Minimize2 },
      { to: '/image/resize',    label: 'Resizer',         icon: Maximize2 },
      { to: '/image/rotate',    label: 'Rotate / Flip',   icon: RotateCw },
      { to: '/image/grayscale', label: 'Grayscale',       icon: Contrast }
    ]
  },
  {
    label: 'Audio Tools',
    items: [
      { to: '/audio/convert',  label: 'Audio Converter',  icon: Music },
      { to: '/audio/compress', label: 'Audio Compressor', icon: Volume2 }
    ]
  },
  {
    label: 'PDF Tools',
    items: [
      { to: '/pdf/images-to-pdf', label: 'Images to PDF',  icon: ImagePlus },
      { to: '/pdf/merge',         label: 'Merge PDFs',     icon: FilePlus2 },
      { to: '/pdf/split',         label: 'Split PDF',      icon: Scissors },
      { to: '/pdf/rotate',        label: 'Rotate Pages',   icon: RotateCw },
      { to: '/pdf/delete-pages',  label: 'Delete Pages',   icon: Trash2 },
      { to: '/pdf/compress',      label: 'Compress PDF',   icon: PackageOpen },
      { to: '/pdf/protect',       label: 'Protect PDF',    icon: Lock },
      { to: '/pdf/watermark',     label: 'Watermark PDF',  icon: PenLine },
      { to: '/pdf/to-images',     label: 'PDF to Images',  icon: FileImage },
    ]
  }
];

export default function Sidebar({ onClose }) {
  const location = useLocation();

  return (
    <div className="h-full bg-slate-900 text-white flex flex-col">
      <div className="flex items-center justify-between px-5 py-5 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            AllInOne
          </span>
        </div>
        <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg hover:bg-slate-700 transition-colors">
          <X size={18} />
        </button>
      </div>

      <nav className="sidebar-scroll flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {navSections.map((section, si) => (
          <div key={si} className={si > 0 ? 'mt-4' : ''}>
            {section.label && (
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-1.5 mt-2">
                {section.label}
              </p>
            )}
            {section.items.map((item) => {
              const isActive = location.pathname === item.to;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150
                    ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
                >
                  <item.icon size={16} className="flex-shrink-0" />
                  {item.label}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-slate-700">
        <p className="text-xs text-slate-500 text-center">All-In-One Converter v1.0</p>
      </div>
    </div>
  );
}

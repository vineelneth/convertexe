import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import ImageConverter from './pages/ImageConverter';
import ImageCompressor from './pages/ImageCompressor';
import ImageResizer from './pages/ImageResizer';
import ImageRotate from './pages/ImageRotate';
import ImageGrayscale from './pages/ImageGrayscale';
import AudioConverter from './pages/AudioConverter';
import AudioCompressor from './pages/AudioCompressor';
import AudioTrimmer from './pages/AudioTrimmer';
import AudioFade from './pages/AudioFade';
import AudioNormalize from './pages/AudioNormalize';
import ImagesToPdf from './pages/pdf/ImagesToPdf';
import MergePdf from './pages/pdf/MergePdf';
import SplitPdf from './pages/pdf/SplitPdf';
import RotatePdf from './pages/pdf/RotatePdf';
import DeletePages from './pages/pdf/DeletePages';
import CompressPdf from './pages/pdf/CompressPdf';
import ProtectPdf from './pages/pdf/ProtectPdf';
import WatermarkPdf from './pages/pdf/WatermarkPdf';
import PdfToImages from './pages/pdf/PdfToImages';
import UnlockPdf from './pages/pdf/UnlockPdf';
import DocumentScanner from './pages/scanner/DocumentScanner';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/image/convert" element={<ImageConverter />} />
        <Route path="/image/compress" element={<ImageCompressor />} />
        <Route path="/image/resize" element={<ImageResizer />} />
        <Route path="/image/rotate" element={<ImageRotate />} />
        <Route path="/image/grayscale" element={<ImageGrayscale />} />
        <Route path="/audio/convert" element={<AudioConverter />} />
        <Route path="/audio/compress" element={<AudioCompressor />} />
        <Route path="/audio/trim" element={<AudioTrimmer />} />
        <Route path="/audio/fade" element={<AudioFade />} />
        <Route path="/audio/normalize" element={<AudioNormalize />} />
        <Route path="/pdf/images-to-pdf" element={<ImagesToPdf />} />
        <Route path="/pdf/merge" element={<MergePdf />} />
        <Route path="/pdf/split" element={<SplitPdf />} />
        <Route path="/pdf/rotate" element={<RotatePdf />} />
        <Route path="/pdf/delete-pages" element={<DeletePages />} />
        <Route path="/pdf/compress" element={<CompressPdf />} />
        <Route path="/pdf/protect" element={<ProtectPdf />} />
        <Route path="/pdf/watermark" element={<WatermarkPdf />} />
        <Route path="/pdf/to-images" element={<PdfToImages />} />
        <Route path="/pdf/unlock" element={<UnlockPdf />} />
        <Route path="/scanner" element={<DocumentScanner />} />
      </Routes>
    </Layout>
  );
}

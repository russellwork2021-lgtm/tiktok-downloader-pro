"use client";

import { useState } from 'react';
import axios from 'axios';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Download, Loader2, CheckCircle2, Circle, AlertCircle, Video } from 'lucide-react';

export default function Home() {
  const [urls, setUrls] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [videos, setVideos] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  const extractVideos = async () => {
    setError(null);
    setLoading(true);
    setVideos([]);
    setSelectedIds(new Set());
    
    const rawUrls = urls.split(/[\s\n]+/).filter(u => u.trim().includes('tiktok.com'));
    
    if (rawUrls.length === 0) {
      setError('Por favor ingresa al menos un enlace válido de TikTok.');
      setLoading(false);
      return;
    }

    const fetchedVideos = [];
    const errors = [];

    if (rawUrls.length === 1 && rawUrls[0].includes('@') && !rawUrls[0].includes('/video/')) {
      try {
        const username = rawUrls[0].split('@')[1].split('?')[0].split('/')[0];
        const res = await axios.post('/api/profile', { username });
        if (res.data.videos) {
          fetchedVideos.push(...res.data.videos);
        } else {
          errors.push(res.data.error || 'Error fetching profile');
        }
      } catch (err: any) {
        if (err.response?.status === 403) {
          errors.push('TikTok ha bloqueado la extracción automática de este perfil. Por favor, entra al perfil, copia los enlaces de los videos que quieres y pégalos aquí uno debajo del otro.');
        } else {
          errors.push(err.response?.data?.error || 'Error conectando con el perfil. Intenta pegar directamente los enlaces de los videos uno por línea.');
        }
      }
    } else {
      for (const url of rawUrls) {
        try {
          const res = await axios.post('/api/video', { url });
          fetchedVideos.push({ ...res.data, originalUrl: url });
        } catch (err: any) {
          errors.push(`Falló: ${url.substring(0, 30)}...`);
        }
      }
    }

    if (fetchedVideos.length > 0) {
      setVideos(fetchedVideos);
      setSelectedIds(new Set(fetchedVideos.map(v => v.id)));
    }
    
    if (errors.length > 0) {
      setError(errors.join(', '));
    }
    
    setLoading(false);
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (selectedIds.size === videos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(videos.map(v => v.id)));
    }
  };

  const handleDownload = async () => {
    if (selectedIds.size === 0) return;
    setDownloading(true);
    setProgress(0);

    const selectedVideos = videos.filter(v => selectedIds.has(v.id));

    try {
      if (selectedVideos.length === 1) {
        const vid = selectedVideos[0];
        const res = await fetch(vid.playUrl);
        const blob = await res.blob();
        saveAs(blob, `tiktok_${vid.id}.mp4`);
      } else {
        const zip = new JSZip();
        
        for (let i = 0; i < selectedVideos.length; i++) {
          const vid = selectedVideos[i];
          try {
            const res = await fetch(vid.playUrl);
            const blob = await res.blob();
            zip.file(`tiktok_${vid.id}.mp4`, blob);
          } catch(e) {
            console.error('Error downloading video inside zip', e);
          }
          setProgress(Math.round(((i + 1) / selectedVideos.length) * 100));
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveAs(zipBlob, `tiktok_videos_${new Date().getTime()}.zip`);
      }
    } catch (err) {
      setError('Hubo un error al descargar. Es posible que el video sea demasiado grande o haya un problema de red.');
    } finally {
      setDownloading(false);
      setProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-32">
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-gray-900">
            TikTok Downloader <span className="text-blue-600">Pro</span>
          </h1>
          <p className="text-lg text-gray-600">
            Descarga videos sin marca de agua directo a tu carpeta de descargas. Pega un enlace de perfil o múltiples enlaces de videos (uno por línea).
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 mb-8 border border-gray-100">
          <textarea
            className="w-full h-32 p-4 text-gray-700 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none outline-none transition-all"
            placeholder="Pega aquí los enlaces (ej. https://www.tiktok.com/@usuario/video/1234)... o un enlace de perfil"
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            disabled={loading || downloading}
          />
          
          <button
            onClick={extractVideos}
            disabled={loading || downloading || urls.trim() === ''}
            className="mt-4 w-full bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-semibold py-3 px-8 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Video className="w-5 h-5" />}
            {loading ? 'Extrayendo videos...' : 'Extraer Videos'}
          </button>

          {error && (
            <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-xl flex items-start gap-3 border border-red-100">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}
        </div>

        {videos.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <h2 className="text-2xl font-bold">Resultados ({videos.length})</h2>
              <button
                onClick={selectAll}
                className="text-blue-600 font-medium hover:text-blue-800 flex items-center gap-2"
              >
                {selectedIds.size === videos.length ? (
                  <><CheckCircle2 className="w-5 h-5" /> Desmarcar todos</>
                ) : (
                  <><Circle className="w-5 h-5" /> Seleccionar todos</>
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {videos.map((vid) => (
                <div 
                  key={vid.id} 
                  onClick={() => toggleSelect(vid.id)}
                  className={`relative cursor-pointer rounded-xl overflow-hidden aspect-[9/16] group transition-all duration-200 ${selectedIds.has(vid.id) ? 'ring-4 ring-blue-500 shadow-xl scale-[0.98]' : 'hover:scale-[1.02] shadow-md ring-1 ring-gray-200'}`}
                >
                  <img src={vid.cover} alt={vid.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                  
                  <div className="absolute top-3 right-3 text-white">
                    {selectedIds.has(vid.id) ? (
                      <CheckCircle2 className="w-7 h-7 text-blue-500 fill-white" />
                    ) : (
                      <Circle className="w-7 h-7 text-white/80 drop-shadow-md" />
                    )}
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent text-white">
                    <p className="text-xs font-medium line-clamp-2">{vid.title || 'Sin título'}</p>
                    <p className="text-[10px] text-gray-300 mt-1">@{vid.author || 'usuario'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.1)] p-4 md:p-6 z-50 transform transition-transform">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left">
              <p className="font-bold text-lg text-gray-900">{selectedIds.size} video{selectedIds.size > 1 ? 's' : ''} seleccionado{selectedIds.size > 1 ? 's' : ''}</p>
              <p className="text-sm text-gray-500 font-medium">
                {selectedIds.size === 1 
                  ? 'Se guardará directo en tu carpeta de Descargas (.mp4)'
                  : 'Se empaquetará en un solo archivo directo a Descargas (.zip)'}
              </p>
            </div>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Descargando... {progress}%
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Descargar {selectedIds.size === 1 ? 'Video' : 'en ZIP'}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

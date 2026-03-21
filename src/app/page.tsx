"use client";

import { useState } from 'react';
import axios from 'axios';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Download, Loader2, CheckCircle2, Circle, AlertCircle, Video, Clipboard, Trash2, Info, Sparkles } from 'lucide-react';

export default function Home() {
  const [urls, setUrls] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [videos, setVideos] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [totalVideos, setTotalVideos] = useState<number | null>(null);

  const [isProfileExtraction, setIsProfileExtraction] = useState(false);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrls(prev => prev ? `${prev}\n${text}` : text);
    } catch (err) {
      setError('No se pudo acceder al portapapeles. Por favor pega manualmente.');
    }
  };

  const handleClear = () => {
    setUrls('');
    setVideos([]);
    setError(null);
  };

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
      setIsProfileExtraction(true);
      try {
        const username = rawUrls[0].split('@')[1].split('?')[0].split('/')[0];
        const res = await axios.post('/api/profile', { username });
        if (res.data.videos) {
          fetchedVideos.push(...res.data.videos);
          if (res.data.total) setTotalVideos(res.data.total);
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
      setIsProfileExtraction(false);
    } else {
      setIsProfileExtraction(false);
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
    setDownloadedCount(0);

    const selectedVideos = videos.filter(v => selectedIds.has(v.id));

    try {
      if (selectedVideos.length === 1) {
        const vid = selectedVideos[0];
        const res = await fetch(vid.playUrl);
        const blob = await res.blob();
        saveAs(blob, `tiktok_${vid.id}.mp4`);
        setProgress(100);
        setDownloadedCount(1);
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
          setDownloadedCount(i + 1);
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveAs(zipBlob, `tiktok_videos_${new Date().getTime()}.zip`);
      }
    } catch (err) {
      setError('Hubo un error al descargar. Es posible que el video sea demasiado grande o haya un problema de red.');
    } finally {
      setDownloading(false);
      setProgress(0);
      setDownloadedCount(0);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 pb-32 selection:bg-blue-100">
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-sm font-semibold mb-2 animate-pulse">
            <Sparkles className="w-4 h-4" />
            <span>Extrae videos en segundos</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-black tracking-tight text-slate-900">
            TikTok <span className="text-blue-600">Russell</span>
          </h1>
          <p className="text-slate-500 font-medium max-w-lg mx-auto">
            La herramienta más rápida y limpia para obtener contenido de TikTok sin marcas de agua.
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.05)] p-6 md:p-10 mb-10 border border-slate-100 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 via-blue-600 to-indigo-600 opacity-0 group-focus-within:opacity-100 transition-opacity" />
          
          <div className="flex justify-between items-center mb-4">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Video className="w-4 h-4 text-blue-500" />
              Enlaces de TikTok
            </label>
            <div className="flex gap-2">
              <button 
                onClick={handlePaste}
                className="text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-200"
              >
                <Clipboard className="w-3.5 h-3.5" /> Pegar
              </button>
              <button 
                onClick={handleClear}
                className="text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors border border-red-100"
              >
                <Trash2 className="w-3.5 h-3.5" /> Limpiar
              </button>
            </div>
          </div>

          <textarea
            className="w-full h-40 p-5 text-slate-700 bg-slate-50/50 border-2 border-slate-100 rounded-2xl focus:ring-0 focus:border-blue-500/50 focus:bg-white resize-none outline-none transition-all text-sm md:text-base leading-relaxed placeholder:text-slate-300"
            placeholder="Pega aquí uno o varios enlaces de videos o un perfil completo..."
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            disabled={loading || downloading}
          />
          
          <button
            onClick={extractVideos}
            disabled={loading || downloading || urls.trim() === ''}
            className="mt-6 w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-4 px-8 rounded-2xl transition-all shadow-lg hover:shadow-slate-200 active:scale-[0.99] flex items-center justify-center gap-3 overflow-hidden group/btn"
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Video className="w-6 h-6 group-hover/btn:scale-110 transition-transform" />
            )}
            <span className="text-lg">
              {loading ? (isProfileExtraction ? 'Analizando perfil...' : 'Extrayendo...') : 'Extraer Videos'}
            </span>
          </button>

          {error && (
            <div className="mt-6 p-4 bg-red-50 text-red-700 rounded-2xl flex items-start gap-3 border border-red-100 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}
        </div>

        {videos.length > 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-8 bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 text-white p-2 rounded-xl">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black">Resultados</h2>
                  <p className="text-sm text-slate-500 font-medium">{videos.length} videos encontrados {totalVideos && totalVideos !== videos.length && `(total perfil: ${totalVideos})`}</p>
                </div>
              </div>
              <button
                onClick={selectAll}
                className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold py-2.5 px-5 rounded-xl flex items-center gap-2.5 transition-all border border-slate-200 text-sm"
              >
                {selectedIds.size === videos.length ? (
                  <><CheckCircle2 className="w-5 h-5 text-blue-600" /> Desmarcar</>
                ) : (
                  <><Circle className="w-5 h-5 text-slate-400" /> Seleccionar Todo</>
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
              {videos.map((vid) => (
                <div 
                  key={vid.id} 
                  onClick={() => toggleSelect(vid.id)}
                  className={`relative cursor-pointer rounded-2xl overflow-hidden aspect-[9/16] group transition-all duration-300 ${selectedIds.has(vid.id) ? 'ring-[6px] ring-blue-500 shadow-2xl scale-[0.97]' : 'hover:scale-[1.03] shadow-lg ring-1 ring-slate-200 hover:ring-blue-200'}`}
                >
                  <img src={vid.cover} alt={vid.title} className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-transparent to-slate-900/20 opacity-60 group-hover:opacity-40 transition-opacity" />
                  
                  <div className="absolute top-4 right-4 z-10">
                    {selectedIds.has(vid.id) ? (
                      <div className="bg-blue-500 rounded-full p-1 shadow-lg">
                        <CheckCircle2 className="w-6 h-6 text-white" />
                      </div>
                    ) : (
                      <div className="bg-black/20 backdrop-blur-md rounded-full p-1 border border-white/30">
                        <Circle className="w-6 h-6 text-white/90" />
                      </div>
                    )}
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-4 z-10 transform transition-transform group-hover:translate-y-[-4px]">
                    <p className="text-[11px] font-black text-blue-400 uppercase tracking-wider mb-1">@{vid.author || 'usuario'}</p>
                    <p className="text-xs font-bold text-white line-clamp-2 leading-snug drop-shadow-md">{vid.title || 'Sin descripción'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[95%] max-w-2xl bg-slate-900/90 backdrop-blur-xl border border-white/10 shadow-2xl rounded-[2rem] p-4 md:p-6 z-50 animate-in slide-in-from-bottom-10 duration-500">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-5">
            <div className="text-center sm:text-left">
              <div className="flex items-center gap-2 mb-1 justify-center sm:justify-start">
                <span className="bg-blue-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">Selección</span>
                <p className="font-black text-xl text-white">{selectedIds.size} {selectedIds.size === 1 ? 'Video' : 'Videos'}</p>
              </div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 justify-center sm:justify-start">
                <Info className="w-3.5 h-3.5" />
                {selectedIds.size === 1 ? 'Formato MP4 HD' : 'Archivo ZIP'}
              </p>
            </div>
            
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-black py-4 px-10 rounded-2xl shadow-[0_10px_30px_rgba(37,99,235,0.4)] transition-all flex items-center justify-center gap-3 active:scale-95 group/dl"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin text-white/50" />
                  <span className="text-lg">{selectedIds.size === 1 ? 'Descargando...' : `${progress}%`}</span>
                </>
              ) : (
                <>
                  <Download className="w-6 h-6 group-hover/dl:translate-y-0.5 transition-transform" />
                  <span className="text-lg">Descargar ahora</span>
                </>
              )}
            </button>
          </div>
          
          {downloading && selectedIds.size > 1 && (
            <div className="mt-4 px-2">
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-blue-500 h-full transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.8)]" 
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from 'react';
import axios from 'axios';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { 
  Download, 
  Loader2, 
  CheckCircle2, 
  Circle, 
  AlertCircle, 
  Video, 
  Clipboard, 
  Trash2, 
  Sparkles,
  Instagram,
  Facebook
} from 'lucide-react';

type Platform = 'tiktok' | 'instagram' | 'facebook';

interface VideoItem {
  id: string;
  platform: Platform;
  title: string;
  cover: string;
  playUrl: string;
  author: string;
  duration: number;
}

const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
);

const platformIcons: Record<Platform, React.ReactNode> = {
  tiktok: <TikTokIcon />,
  instagram: <Instagram className="w-5 h-5" />,
  facebook: <Facebook className="w-5 h-5" />
};

const platformNames: Record<Platform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook'
};

const platformColors: Record<Platform, string> = {
  tiktok: 'bg-black',
  instagram: 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500',
  facebook: 'bg-blue-600'
};

export default function Home() {
  const [urls, setUrls] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadedCount, setDownloadedCount] = useState(0);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrls(prev => prev ? `${prev}, ${text}` : text);
    } catch {
      setError('No se pudo acceder al portapapeles. Por favor pega manualmente.');
    }
  };

  const handleClear = () => {
    setUrls('');
    setVideos([]);
    setError(null);
    setSelectedIds(new Set());
  };

  const parseUrls = (input: string): string[] => {
    return input
      .split(/[,\n]+/)
      .map(url => url.trim())
      .filter(url => {
        const lower = url.toLowerCase();
        return lower.includes('tiktok.com') || 
               lower.includes('instagram.com') ||
               lower.includes('facebook.com') ||
               lower.includes('fb.watch');
      });
  };

  const extractVideos = async () => {
    setError(null);
    setLoading(true);
    setVideos([]);
    setSelectedIds(new Set());
    
    const rawUrls = parseUrls(urls);
    
    if (rawUrls.length === 0) {
      setError('Por favor ingresa al menos un enlace válido de TikTok, Instagram o Facebook.');
      setLoading(false);
      return;
    }

    const fetchedVideos: VideoItem[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rawUrls.length; i++) {
      const url = rawUrls[i];
      try {
        const res = await axios.post('/api/download', { url });
        if (res.data.playUrl) {
          fetchedVideos.push(res.data);
        } else {
          errors.push(`No se pudo obtener: ${url.substring(0, 40)}...`);
        }
      } catch {
        errors.push(`Error: ${url.substring(0, 40)}...`);
      }
      setProgress(Math.round(((i + 1) / rawUrls.length) * 100));
    }

    if (fetchedVideos.length > 0) {
      setVideos(fetchedVideos);
      setSelectedIds(new Set(fetchedVideos.map(v => v.id)));
    }
    
    if (errors.length > 0) {
      setError(`${errors.length} video(s) no pudieron ser procesados.`);
    }
    
    setLoading(false);
    setProgress(0);
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
        const ext = vid.platform === 'tiktok' ? 'mp4' : 'mp4';
        saveAs(blob, `${vid.platform}_${vid.id.substring(0, 8)}.${ext}`);
        setProgress(100);
        setDownloadedCount(1);
      } else {
        const zip = new JSZip();
        
        for (let i = 0; i < selectedVideos.length; i++) {
          const vid = selectedVideos[i];
          try {
            const res = await fetch(vid.playUrl);
            const blob = await res.blob();
            const ext = vid.platform === 'tiktok' ? 'mp4' : 'mp4';
            zip.file(`${vid.platform}_${vid.id.substring(0, 8)}.${ext}`, blob);
          } catch(e) {
            console.error('Error downloading video inside zip', e);
          }
          setProgress(Math.round(((i + 1) / selectedVideos.length) * 100));
          setDownloadedCount(i + 1);
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveAs(zipBlob, `videos_${new Date().getTime()}.zip`);
      }
      } catch {
      setError('Hubo un error al descargar. Es posible que el video sea demasiado grande o haya un problema de red.');
    } finally {
      setDownloading(false);
      setProgress(0);
      setDownloadedCount(0);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900 pb-32 selection:bg-blue-100">
      <main className="max-w-5xl mx-auto px-4 py-12">
        <div className="text-center mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-pink-50 via-purple-50 to-blue-50 text-purple-600 text-sm font-semibold mb-2">
            <Sparkles className="w-4 h-4" />
            <span>Descarga videos sin marca de agua</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900">
            Social <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 bg-clip-text text-transparent">Media</span> Downloader
          </h1>
          <p className="text-slate-500 font-medium max-w-xl mx-auto">
            Descarga videos de TikTok, Instagram y Facebook de forma rápida y sin marcas de agua.
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.08)] p-6 md:p-10 mb-10 border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 opacity-0 group-focus-within:opacity-100 transition-opacity" />
          
          <div className="flex justify-between items-center mb-6">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Video className="w-4 h-4 text-purple-500" />
              Enlaces de Videos
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

          <div className="flex flex-wrap gap-2 mb-4">
            {(['tiktok', 'instagram', 'facebook'] as Platform[]).map((platform) => (
              <div key={platform} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 text-xs font-medium text-slate-600">
                {platformIcons[platform]}
                <span>{platformNames[platform]}</span>
              </div>
            ))}
          </div>

          <textarea
            className="w-full h-44 p-5 text-slate-700 bg-slate-50/50 border-2 border-slate-100 rounded-2xl focus:ring-0 focus:border-purple-500/50 focus:bg-white resize-none outline-none transition-all text-sm md:text-base leading-relaxed placeholder:text-slate-300"
            placeholder="Pega aquí uno o varios enlaces separados por coma o salto de línea...&#10;&#10;Ejemplos:&#10;https://www.tiktok.com/@usuario/video/...&#10;https://www.instagram.com/reel/...&#10;https://www.facebook.com/watch?v=..."
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            disabled={loading || downloading}
          />
          
          <button
            onClick={extractVideos}
            disabled={loading || downloading || urls.trim() === ''}
            className="mt-6 w-full bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 hover:from-pink-600 hover:via-purple-600 hover:to-blue-600 disabled:from-slate-300 disabled:to-slate-300 disabled:bg-gradient-to-r text-white font-bold py-4 px-8 rounded-2xl transition-all shadow-lg hover:shadow-purple-200 active:scale-[0.99] flex items-center justify-center gap-3 overflow-hidden"
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Download className="w-6 h-6" />
            )}
            <span className="text-lg">
              {loading ? `Analizando... ${progress}%` : 'Extraer Videos'}
            </span>
          </button>

          {loading && (
            <div className="mt-4 px-2">
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 h-full transition-all duration-300" 
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

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
                <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 text-white p-2 rounded-xl">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black">Resultados</h2>
                  <p className="text-sm text-slate-500 font-medium">{videos.length} videos encontrados</p>
                </div>
              </div>
              <button
                onClick={selectAll}
                className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold py-2.5 px-5 rounded-xl flex items-center gap-2.5 transition-all border border-slate-200 text-sm"
              >
                {selectedIds.size === videos.length ? (
                  <><CheckCircle2 className="w-5 h-5 text-purple-500" /> Desmarcar</>
                ) : (
                  <><Circle className="w-5 h-5 text-slate-400" /> Seleccionar Todo</>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((vid) => (
                <div 
                  key={vid.id} 
                  onClick={() => toggleSelect(vid.id)}
                  className={`relative cursor-pointer rounded-2xl overflow-hidden group transition-all duration-300 ${
                    selectedIds.has(vid.id) 
                      ? 'ring-[4px] ring-purple-500 shadow-2xl scale-[0.98]' 
                      : 'hover:scale-[1.02] shadow-lg ring-1 ring-slate-200 hover:ring-purple-200'
                  }`}
                >
                  <div className="aspect-video bg-slate-100">
                    {vid.cover ? (
                      <img src={vid.cover} alt={vid.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                        <div className={`${platformColors[vid.platform]} p-4 rounded-full text-white`}>
                          {platformIcons[vid.platform]}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="absolute top-3 right-3 z-10">
                    {selectedIds.has(vid.id) ? (
                      <div className="bg-purple-500 rounded-full p-1 shadow-lg">
                        <CheckCircle2 className="w-5 h-5 text-white" />
                      </div>
                    ) : (
                      <div className="bg-white/90 backdrop-blur-md rounded-full p-1 shadow">
                        <Circle className="w-5 h-5 text-slate-400" />
                      </div>
                    )}
                  </div>

                  <div className="absolute top-3 left-3 z-10">
                    <div className={`${platformColors[vid.platform]} px-2.5 py-1 rounded-full text-white text-xs font-bold flex items-center gap-1.5 shadow-lg`}>
                      {platformIcons[vid.platform]}
                      <span className="capitalize">{vid.platform}</span>
                    </div>
                  </div>

                  <div className="p-4 bg-white">
                    <p className="text-xs font-medium text-purple-600 mb-1">@{vid.author}</p>
                    <p className="text-sm font-medium text-slate-700 line-clamp-2 leading-snug">
                      {vid.title || 'Sin descripción'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[95%] max-w-2xl bg-slate-900/95 backdrop-blur-xl border border-white/10 shadow-2xl rounded-[2rem] p-4 md:p-6 z-50 animate-in slide-in-from-bottom-10 duration-500">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-5">
            <div className="text-center sm:text-left">
              <div className="flex items-center gap-2 mb-1 justify-center sm:justify-start">
                <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">
                  Selección
                </span>
                <p className="font-black text-xl text-white">{selectedIds.size} {selectedIds.size === 1 ? 'Video' : 'Videos'}</p>
              </div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 justify-center sm:justify-start">
                <Video className="w-3.5 h-3.5" />
                {selectedIds.size === 1 ? 'Formato MP4 HD' : 'Archivo ZIP'}
              </p>
            </div>
            
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full sm:w-auto bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 hover:from-pink-600 hover:via-purple-600 hover:to-blue-600 disabled:from-slate-600 disabled:to-slate-600 text-white font-black py-4 px-10 rounded-2xl shadow-[0_10px_30px_rgba(168,85,247,0.4)] transition-all flex items-center justify-center gap-3 active:scale-95"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin text-white/50" />
                  <span className="text-lg">{downloadedCount}/{selectedIds.size}</span>
                </>
              ) : (
                <>
                  <Download className="w-6 h-6" />
                  <span className="text-lg">Descargar</span>
                </>
              )}
            </button>
          </div>
          
          {downloading && selectedIds.size > 1 && (
            <div className="mt-4 px-2">
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 h-full transition-all duration-300" 
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

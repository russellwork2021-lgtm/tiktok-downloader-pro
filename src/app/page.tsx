"use client";

import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import JSZip from 'jszip';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Circle,
  Clipboard,
  Download,
  Eye,
  Facebook,
  History,
  Instagram,
  Loader2,
  RotateCcw,
  Play,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { processVideo, sanitizeFilename, type VideoEditSettings } from '@/lib/video-editor';

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

interface HistoryItem {
  id: string;
  filename: string;
  count: number;
  createdAt: string;
}

const ORIGINAL_EDIT_SETTINGS: VideoEditSettings = {
  trimStart: 0,
  trimEnd: 0,
  zoom: 0,
  flip: false,
  speed: 1,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  volume: 100,
  fps: null,
};

const AUTOMATIC_EDIT_SETTINGS: VideoEditSettings = {
  trimStart: 0.1,
  trimEnd: 0.1,
  zoom: 2,
  flip: false,
  speed: 1.03,
  brightness: 3,
  contrast: -2,
  saturation: 2,
  volume: 90,
  fps: null,
};

const EDIT_PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  settings: VideoEditSettings;
}> = [
  {
    id: 'automatic',
    label: 'Automático',
    description: 'Se aplica al descargar',
    settings: AUTOMATIC_EDIT_SETTINGS,
  },
  {
    id: 'original',
    label: 'Original',
    description: 'Sin ajustes',
    settings: ORIGINAL_EDIT_SETTINGS,
  },
  {
    id: 'soft',
    label: 'Mejora suave',
    description: 'Color y audio equilibrados',
    settings: { ...ORIGINAL_EDIT_SETTINGS, brightness: 3, contrast: -2, saturation: 2, volume: 90 },
  },
  {
    id: 'reframe',
    label: 'Reencuadre',
    description: 'Zoom ligero para formato social',
    settings: { ...ORIGINAL_EDIT_SETTINGS, zoom: 4, brightness: 2, saturation: 2 },
  },
  {
    id: 'audio',
    label: 'Audio limpio',
    description: 'Reduce el audio original',
    settings: { ...ORIGINAL_EDIT_SETTINGS, volume: 80 },
  },
];

const HISTORY_STORAGE_KEY = 'downloader-pro-history';

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
  </svg>
);

const platformIcons: Record<Platform, React.ReactNode> = {
  tiktok: <TikTokIcon />,
  instagram: <Instagram className="h-5 w-5" />,
  facebook: <Facebook className="h-5 w-5" />,
};

const platformNames: Record<Platform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
};

const platformColors: Record<Platform, string> = {
  tiktok: 'bg-black',
  instagram: 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500',
  facebook: 'bg-blue-600',
};

export default function Home() {
  const [urls, setUrls] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editSettings, setEditSettings] = useState<VideoEditSettings>(AUTOMATIC_EDIT_SETTINGS);
  const [filename, setFilename] = useState('video_editado');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [downloadMode, setDownloadMode] = useState<'individual' | 'zip' | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const cancelRequestedRef = useRef(false);
  const automaticPresetActive = JSON.stringify(editSettings) === JSON.stringify(AUTOMATIC_EDIT_SETTINGS);

  useEffect(() => {
    try {
      const storedHistory = window.localStorage.getItem(HISTORY_STORAGE_KEY);
      if (storedHistory) {
        setHistory(JSON.parse(storedHistory) as HistoryItem[]);
      }
    } catch {
      // El historial es opcional; si el navegador lo bloquea seguimos trabajando.
    }
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const saveHistory = (count: number, name: string) => {
    const entry: HistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      filename: sanitizeFilename(name),
      count,
      createdAt: new Date().toISOString(),
    };
    const nextHistory = [entry, ...history].slice(0, 8);
    setHistory(nextHistory);
    try {
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(nextHistory));
    } catch {
      // No bloqueamos la descarga si el almacenamiento local no está disponible.
    }
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      window.localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // El historial puede limpiarse visualmente aunque localStorage esté bloqueado.
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrls((prev) => (prev ? `${prev}, ${text}` : text));
    } catch {
      setError('No se pudo acceder al portapapeles. Por favor pega manualmente.');
    }
  };

  const handleClear = () => {
    setUrls('');
    setVideos([]);
    setError(null);
    setSelectedIds(new Set());
    setActiveVideoId(null);
    setPreviewUrl(null);
    setPreviewError(null);
  };

  const parseUrls = (input: string): string[] => {
    return Array.from(new Set(input
      .split(/[,\n]+/)
      .map((url) => url.trim())
      .filter((url) => {
        const lower = url.toLowerCase();
        return (
          lower.includes('tiktok.com') ||
          lower.includes('instagram.com') ||
          lower.includes('facebook.com') ||
          lower.includes('fb.watch')
        );
      })));
  };

  const extractVideos = async () => {
    setError(null);
    setLoading(true);
    setVideos([]);
    setSelectedIds(new Set());
    setActiveVideoId(null);

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
      } catch (requestError) {
        const apiMessage = axios.isAxiosError(requestError)
          ? requestError.response?.data?.error
          : null;
        errors.push(apiMessage
          ? `${url.substring(0, 34)}... — ${apiMessage}`
          : `Error: ${url.substring(0, 40)}...`);
      }
      setProgress(Math.round(((i + 1) / rawUrls.length) * 100));
    }

    if (fetchedVideos.length > 0) {
      setVideos(fetchedVideos);
      setSelectedIds(new Set(fetchedVideos.map((video) => video.id)));
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
      setSelectedIds(new Set(videos.map((video) => video.id)));
    }
  };

  const applyPreset = (preset: (typeof EDIT_PRESETS)[number]) => {
    setEditSettings({ ...preset.settings });
    setEditorOpen(true);
    setPreviewError(null);
  };

  const handlePreview = async () => {
    const video = videos.find((item) => selectedIds.has(item.id));
    if (!video) return;

    setPreviewLoading(true);
    setPreviewProgress(0);
    setPreviewError(null);

    try {
      const processed = await processVideo({
        sourceUrl: video.playUrl,
        settings: editSettings,
        onProgress: (value) => setPreviewProgress(Math.round(value * 100)),
      });
      setPreviewUrl(URL.createObjectURL(processed.blob));
    } catch (previewProcessingError) {
      setPreviewError(previewProcessingError instanceof Error
        ? previewProcessingError.message
        : 'No se pudo generar la vista previa.');
    } finally {
      setPreviewLoading(false);
      setPreviewProgress(0);
    }
  };

  const handleDownload = async (mode: 'individual' | 'zip' = 'individual') => {
    if (selectedIds.size === 0) return;
    setDownloading(true);
    setDownloadMode(mode);
    setProgress(0);
    setDownloadedCount(0);
    setError(null);
    cancelRequestedRef.current = false;
    setCancelRequested(false);

    const selectedVideos = videos.filter((video) => selectedIds.has(video.id));
    const archive = mode === 'zip' ? new JSZip() : null;
    let processedCount = 0;

    try {
      for (let i = 0; i < selectedVideos.length; i++) {
        if (cancelRequestedRef.current) break;
        const video = selectedVideos[i];
        const processed = await processVideo({
          sourceUrl: video.playUrl,
          settings: editSettings,
          onProgress: (videoProgress) => {
            setProgress(Math.round(((i + videoProgress) / selectedVideos.length) * 100));
          },
        });
        if (cancelRequestedRef.current) break;

        const outputName = selectedVideos.length === 1
          ? filename
          : `${filename}_${String(i + 1).padStart(2, '0')}`;
        const safeOutputName = sanitizeFilename(outputName);

        if (archive) {
          archive.file(safeOutputName, processed.blob);
        } else {
          triggerBlobDownload(processed.blob, safeOutputName);
        }

        processedCount += 1;
        setDownloadedCount(processedCount);
      }

      if (archive && processedCount > 0 && !cancelRequestedRef.current) {
        const archiveBlob = await archive.generateAsync(
          { type: 'blob', compression: 'STORE' },
          (metadata) => setProgress(Math.round(92 + metadata.percent * 0.08)),
        );
        triggerBlobDownload(archiveBlob, sanitizeFilename(`${filename}_paquete`));
      }

      if (processedCount > 0) {
        saveHistory(processedCount, mode === 'zip' ? `${filename}_paquete` : filename);
      }

      if (cancelRequestedRef.current) {
        setError(`Proceso cancelado. ${processedCount} video(s) ya estaban listos.`);
      }
    } catch (downloadError) {
      const message = downloadError instanceof Error
        ? downloadError.message
        : typeof downloadError === 'string'
          ? downloadError
          : downloadError && typeof downloadError === 'object' && 'message' in downloadError
            ? String(downloadError.message)
            : 'Error al procesar el video.';
      setError(message || 'Error al procesar el video.');
    } finally {
      setDownloading(false);
      setProgress(0);
      setDownloadMode(null);
      setCancelRequested(false);
    }
  };

  return (
    <div className="studio-shell relative min-h-screen text-white selection:bg-cyan-200 selection:text-slate-950">
      <div className="studio-atmosphere" aria-hidden="true" />

      <header className="relative z-20 border-b border-white/[0.08] bg-[#080e13]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <a href="#top" className="flex items-center gap-3">
            <span className="studio-logo">
              <Play className="h-5 w-5 fill-current" />
            </span>
            <span>
              <span className="block text-[10px] font-mono tracking-[0.22em] text-cyan-200/70 uppercase">Social media</span>
              <span className="block text-lg font-semibold tracking-tight text-white">Downloader<span className="ml-1 text-cyan-200">/pro</span></span>
            </span>
          </a>

          <div className="hidden items-center gap-3 sm:flex">
            <a href="#workspace" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-white/75 transition hover:border-white/20 hover:bg-white/[0.09] hover:text-white">
              Ir al estudio <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </header>

      <main id="top" className="relative z-10 mx-auto max-w-7xl px-5 pb-16 pt-10 lg:px-8 lg:pt-16">
        <div className="studio-intro-grid">
        <section className="studio-intro">
          <div>
            <div className="studio-eyebrow">
              <Sparkles className="h-3.5 w-3.5" />
              TU ESTUDIO DIGITAL
            </div>
            <h1 className="studio-title">
              Tu contenido.
              <span className="studio-title-accent">Otra dimensión.</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-slate-400">
              Del enlace al archivo final. Reúne tus videos, ajusta los detalles y descárgalos desde un solo lugar.
            </p>
            <div className="studio-signal" aria-hidden="true">
              <div className="signal-orbit signal-orbit-one" />
              <div className="signal-orbit signal-orbit-two" />
              <div className="signal-core"><Play className="h-9 w-9 fill-current" /></div>
              <span className="signal-caption">VIDEO / AUDIO / MOVIMIENTO</span>
              <span className="signal-coordinate">+ CREA A TU RITMO</span>
            </div>
          </div>

        </section>

        <section id="workspace" className="scroll-mt-6">
          <div className="studio-source-panel">
            <div className="studio-panel-bar"><span>ESTUDIO / IMPORTAR</span><span className="flex gap-1.5" aria-hidden="true"><i /><i /><i /></span></div>
            <div className="border-b border-white/[0.08] px-6 py-6 sm:px-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="mb-3 flex items-center gap-2 text-[10px] font-mono tracking-[0.2em] text-cyan-200 uppercase">
                    01 — COMIENZA AQUÍ
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Un enlace. Todo empieza.</h2>
                  <p className="mt-2 text-sm leading-6 text-white/45">Uno o varios enlaces separados por coma o salto de línea.</p>
                </div>
              </div>

              <div className="mt-7 flex flex-wrap gap-2">
                {(['tiktok', 'instagram', 'facebook'] as Platform[]).map((platform) => (
                  <span key={platform} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 text-xs font-medium text-slate-300">
                    <span className="text-white/80">{platformIcons[platform]}</span>
                    {platformNames[platform]}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-6 sm:p-8">
              <div className="relative">
                <textarea
                  aria-label="Enlaces de videos"
                  className="studio-url-input"
                  placeholder={'https://www.tiktok.com/@usuario/video/...\nhttps://www.instagram.com/reel/...\nhttps://www.facebook.com/watch?v=...'}
                  value={urls}
                  onChange={(event) => setUrls(event.target.value)}
                  disabled={loading || downloading}
                />
                <div className="absolute bottom-4 right-4 flex gap-2">
                  <button
                    type="button"
                    onClick={handlePaste}
                    disabled={loading || downloading}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-xs font-bold text-white/65 transition hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Clipboard className="h-3.5 w-3.5" /> Pegar
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={loading || downloading}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-xs font-bold text-white/65 transition hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Limpiar
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={extractVideos}
                disabled={loading || downloading || urls.trim() === ''}
                className="studio-primary mt-5 flex w-full items-center justify-center gap-3 px-6 py-4 text-sm font-bold"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                {loading ? `Analizando... ${progress}%` : 'Extraer videos'}
                {!loading && <ArrowUpRight className="h-4 w-4" />}
              </button>

              {loading && (
                <div className="mt-5">
                  <div className="mb-2 flex justify-between text-[10px] font-bold tracking-[0.16em] text-white/35 uppercase">
                    <span>Procesando fuentes</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-300 transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}

              {error && (
                <div aria-live="polite" className="mt-5 flex items-start gap-3 rounded-2xl border border-red-300/15 bg-red-400/[0.08] p-4 text-red-200">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <p className="text-sm font-medium leading-6">{error}</p>
                </div>
              )}
            </div>
          </div>

        </section>

        </div>

        {videos.length > 0 && (
          <section className="mt-16">
            <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <div className="mb-3 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-cyan-300 uppercase">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                  02 / TUS VIDEOS
                </div>
                <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Contenido encontrado</h2>
                <p className="mt-2 text-sm text-white/45">{videos.length} {videos.length === 1 ? 'video listo' : 'videos listos'} para descargar.</p>
              </div>
              <button
                type="button"
                onClick={selectAll}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold text-white/75 transition hover:border-white/20 hover:bg-white/[0.1] hover:text-white"
              >
                {selectedIds.size === videos.length ? <CheckCircle2 className="h-4 w-4 text-cyan-300" /> : <Circle className="h-4 w-4 text-white/35" />}
                {selectedIds.size === videos.length ? 'Desmarcar todo' : 'Seleccionar todo'}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {videos.map((video) => {
                const isSelected = selectedIds.has(video.id);
                const isPreviewing = activeVideoId === video.id;
                return (
                  <div
                    key={video.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleSelect(video.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleSelect(video.id);
                      }
                    }}
                    className={`group cursor-pointer overflow-hidden rounded-[1.5rem] border bg-white/[0.045] transition duration-300 focus:outline-none focus:ring-2 focus:ring-violet-300/70 ${isSelected ? 'border-violet-300/70 shadow-2xl shadow-violet-500/15 ring-2 ring-violet-400/30' : 'border-white/10 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.07]'}`}
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-slate-900">
                      {isPreviewing ? (
                        <div className="relative h-full w-full bg-black" onClick={(event) => event.stopPropagation()}>
                          <video
                            src={video.playUrl}
                            poster={video.cover || undefined}
                            controls
                            playsInline
                            preload="metadata"
                            className="h-full w-full object-contain"
                            aria-label={`Vista previa de ${video.title || 'video'}`}
                          />
                          <span className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/15 bg-slate-950/65 px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-cyan-100 uppercase backdrop-blur-md">Vista previa</span>
                        </div>
                      ) : video.cover ? (
                        <img src={video.cover} alt={video.title} loading="lazy" className="h-full w-full object-contain" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_20%,rgba(139,92,246,0.42),transparent_48%),linear-gradient(135deg,#111827,#312e81)]">
                          <span className={`${platformColors[video.platform]} rounded-full p-5 text-white shadow-2xl`}>
                            {platformIcons[video.platform]}
                          </span>
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/85 via-transparent to-slate-950/10" />
                      <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/50 px-2.5 py-1.5 text-[10px] font-bold tracking-[0.12em] text-white/85 uppercase backdrop-blur-md">
                        {platformIcons[video.platform]}
                        {video.platform}
                      </span>
                      <span className={`absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-md ${isSelected ? 'bg-violet-400 text-slate-950' : 'border border-white/20 bg-slate-950/45 text-white/55'}`}>
                        {isSelected ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                      </span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setActiveVideoId(isPreviewing ? null : video.id);
                        }}
                        className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/55 px-2.5 py-1.5 text-xs font-semibold text-white/85 backdrop-blur-md transition hover:border-cyan-200/40 hover:bg-slate-950/80"
                      >
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15">{isPreviewing ? <X className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</span>
                        {isPreviewing ? 'Cerrar video' : 'Ver video'}
                      </button>
                    </div>
                    <div className="border-t border-white/[0.08] p-5">
                      <p className="text-xs font-semibold text-violet-300">@{video.author}</p>
                      <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-white/85">{video.title || 'Sin descripción'}</h3>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      {selectedIds.size > 0 && (
        <section aria-label="Edición y descarga" className="studio-export-panel mt-8 rounded-2xl border border-cyan-200/20 bg-[#101c24] p-4 sm:p-6">
          {editorOpen && (
            <div className="mb-5 rounded-2xl border border-white/10 bg-[#080a12]/80 p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-white">Editar antes de guardar</p>
                  <p className="mt-1 text-xs text-white/40">Los ajustes se aplican en tu navegador antes de descargar.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditSettings({ ...AUTOMATIC_EDIT_SETTINGS })}
                  disabled={downloading}
                  className="text-xs font-bold text-violet-300 transition hover:text-white disabled:opacity-40"
                >
                  Restablecer automático
                </button>
              </div>

              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold tracking-[0.14em] text-cyan-200 uppercase">Presets rápidos</p>
                    <p className="mt-1 text-xs text-white/35">Aplica una base y luego ajusta cada control.</p>
                  </div>
                  <span className="hidden text-[10px] font-mono tracking-[0.12em] text-white/25 uppercase sm:block">Edición para contenido propio</span>
                </div>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {EDIT_PRESETS.map((preset) => {
                    const isActive = JSON.stringify(editSettings) === JSON.stringify(preset.settings);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset)}
                        disabled={downloading || previewLoading}
                        className={`rounded-xl border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${isActive ? 'border-cyan-200/50 bg-cyan-200/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.07]'}`}
                      >
                        <span className="block text-xs font-bold text-white/85">{preset.label}</span>
                        <span className="mt-1 block text-[11px] leading-4 text-white/35">{preset.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="sm:col-span-2 lg:col-span-4">
                  <span className="mb-1.5 block text-[10px] font-bold tracking-[0.16em] text-white/35 uppercase">Nombre del archivo</span>
                  <input
                    value={filename}
                    onChange={(event) => setFilename(event.target.value)}
                    disabled={downloading}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-violet-400/60"
                    placeholder="video_editado"
                  />
                </label>

                <label>
                  <span className="mb-1.5 block text-[10px] font-bold tracking-[0.16em] text-white/35 uppercase">Recorte inicial</span>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    step="0.1"
                    value={editSettings.trimStart}
                    onChange={(event) => setEditSettings((current) => ({ ...current, trimStart: Number(event.target.value) }))}
                    disabled={downloading}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400/60"
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-[10px] font-bold tracking-[0.16em] text-white/35 uppercase">Recorte final</span>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    step="0.1"
                    value={editSettings.trimEnd}
                    onChange={(event) => setEditSettings((current) => ({ ...current, trimEnd: Number(event.target.value) }))}
                    disabled={downloading}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400/60"
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-[10px] font-bold tracking-[0.16em] text-white/35 uppercase">Velocidad</span>
                  <select
                    value={editSettings.speed}
                    onChange={(event) => setEditSettings((current) => ({ ...current, speed: Number(event.target.value) }))}
                    disabled={downloading}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400/60"
                  >
                    <option value="1">1.00x</option>
                    <option value="1.03">1.03x</option>
                    <option value="1.05">1.05x</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1.5 block text-[10px] font-bold tracking-[0.16em] text-white/35 uppercase">FPS de salida</span>
                  <select
                    value={editSettings.fps ?? 'source'}
                    onChange={(event) => setEditSettings((current) => ({ ...current, fps: event.target.value === 'source' ? null : Number(event.target.value) }))}
                    disabled={downloading}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400/60"
                  >
                    <option value="source">Original</option>
                    <option value="30">30 FPS</option>
                    <option value="60">60 FPS</option>
                  </select>
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={editSettings.flip}
                    onChange={(event) => setEditSettings((current) => ({ ...current, flip: event.target.checked }))}
                    disabled={downloading}
                    className="h-4 w-4 accent-violet-400"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-white/80">Espejo horizontal</span>
                    <span className="block text-xs text-white/35">Úsalo solo cuando el texto no quede invertido.</span>
                  </span>
                </label>

                <label>
                  <span className="mb-1.5 flex justify-between text-[10px] font-bold tracking-[0.16em] text-white/35 uppercase"><span>Zoom</span><span>{editSettings.zoom}%</span></span>
                  <input type="range" min="0" max="10" step="1" value={editSettings.zoom} onChange={(event) => setEditSettings((current) => ({ ...current, zoom: Number(event.target.value) }))} disabled={downloading} className="w-full accent-violet-400" />
                </label>
                <label>
                  <span className="mb-1.5 flex justify-between text-[10px] font-bold tracking-[0.16em] text-white/35 uppercase"><span>Brillo</span><span>{editSettings.brightness > 0 ? '+' : ''}{editSettings.brightness}%</span></span>
                  <input type="range" min="-20" max="20" step="1" value={editSettings.brightness} onChange={(event) => setEditSettings((current) => ({ ...current, brightness: Number(event.target.value) }))} disabled={downloading} className="w-full accent-violet-400" />
                </label>
                <label>
                  <span className="mb-1.5 flex justify-between text-[10px] font-bold tracking-[0.16em] text-white/35 uppercase"><span>Contraste</span><span>{editSettings.contrast > 0 ? '+' : ''}{editSettings.contrast}%</span></span>
                  <input type="range" min="-20" max="20" step="1" value={editSettings.contrast} onChange={(event) => setEditSettings((current) => ({ ...current, contrast: Number(event.target.value) }))} disabled={downloading} className="w-full accent-violet-400" />
                </label>
                <label>
                  <span className="mb-1.5 flex justify-between text-[10px] font-bold tracking-[0.16em] text-white/35 uppercase"><span>Saturación</span><span>{editSettings.saturation > 0 ? '+' : ''}{editSettings.saturation}%</span></span>
                  <input type="range" min="-20" max="20" step="1" value={editSettings.saturation} onChange={(event) => setEditSettings((current) => ({ ...current, saturation: Number(event.target.value) }))} disabled={downloading} className="w-full accent-violet-400" />
                </label>
                <label>
                  <span className="mb-1.5 flex justify-between text-[10px] font-bold tracking-[0.16em] text-white/35 uppercase"><span>Volumen</span><span>{editSettings.volume}%</span></span>
                  <input type="range" min="0" max="150" step="5" value={editSettings.volume} onChange={(event) => setEditSettings((current) => ({ ...current, volume: Number(event.target.value) }))} disabled={downloading} className="w-full accent-violet-400" />
                </label>
              </div>

              <div className="mt-5 rounded-2xl border border-cyan-200/10 bg-cyan-100/[0.03] p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-200/10 text-cyan-200"><Eye className="h-4 w-4" /></span>
                    <div>
                      <p className="text-sm font-bold text-white">Vista previa del resultado</p>
                      <p className="mt-1 text-xs leading-5 text-white/40">Procesa el primer video seleccionado para revisar los cambios antes de descargar.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handlePreview}
                    disabled={downloading || previewLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-200/25 bg-cyan-200/10 px-4 py-3 text-xs font-bold text-cyan-100 transition hover:bg-cyan-200/20 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                  >
                    {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                    {previewLoading ? `Generando ${previewProgress}%` : 'Generar vista previa'}
                  </button>
                </div>

                {previewError && (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-300/15 bg-red-400/[0.08] p-3 text-xs leading-5 text-red-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{previewError}</span>
                  </div>
                )}

                {previewUrl && !previewLoading && (
                  <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black">
                    <video className="mx-auto max-h-[480px] w-full object-contain" src={previewUrl} controls playsInline preload="metadata" />
                    <div className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2">
                      <span className="text-[10px] font-mono tracking-[0.12em] text-white/35 uppercase">Preview listo</span>
                      <button type="button" onClick={() => setPreviewUrl(null)} className="inline-flex items-center gap-1 text-xs font-bold text-white/50 transition hover:text-white"><X className="h-3.5 w-3.5" /> Cerrar</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500/20 to-cyan-400/20 text-cyan-200 ring-1 ring-white/10">
                <Download className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-white">{selectedIds.size} {selectedIds.size === 1 ? 'video seleccionado' : 'videos seleccionados'}</p>
                <p className="mt-1 text-xs text-white/40">
                  {automaticPresetActive ? 'Preset automático activo al descargar' : 'Ajustes personalizados activos'}
                </p>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <button
                type="button"
                onClick={() => setEditorOpen((open) => !open)}
                disabled={downloading || previewLoading}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto ${editorOpen ? 'border-violet-300/40 bg-violet-400/15 text-violet-100' : 'border-white/10 bg-white/[0.06] text-white/70 hover:bg-white/[0.1] hover:text-white'}`}
              >
                <SlidersHorizontal className="h-4 w-4" />
                {editorOpen ? 'Ocultar edición' : 'Editar opcionalmente'}
              </button>
              <button
                type="button"
                onClick={() => handleDownload('individual')}
                disabled={downloading || previewLoading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-black text-slate-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/40 sm:w-auto"
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {downloading ? `${downloadedCount}/${selectedIds.size} procesados` : 'Descargar editados'}
              </button>
              {selectedIds.size > 1 && (
                <button
                  type="button"
                  onClick={() => handleDownload('zip')}
                  disabled={downloading || previewLoading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-200/25 bg-cyan-200/10 px-5 py-3.5 text-sm font-black text-cyan-100 transition hover:bg-cyan-200/20 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                >
                  <Download className="h-4 w-4" />
                  {downloadMode === 'zip' ? 'Creando ZIP…' : 'Descargar ZIP'}
                </button>
              )}
            </div>
          </div>
          {downloading && (
            <div className="mt-5" role="status" aria-live="polite">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs text-cyan-100">Preparando descarga · {progress}%</p>
                <button
                  type="button"
                  onClick={() => { cancelRequestedRef.current = true; setCancelRequested(true); }}
                  disabled={cancelRequested}
                  className="inline-flex items-center gap-1 text-xs font-bold text-white/55 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <X className="h-3.5 w-3.5" />
                  {cancelRequested ? 'Cancelando…' : 'Cancelar'}
                </button>
              </div>
              <div role="progressbar" aria-label="Procesamiento del video" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-cyan-200 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </section>
      )}

      {history.length > 0 && (
        <section aria-label="Historial local" className="mt-12 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] text-cyan-200"><History className="h-4 w-4" /></span>
              <div>
                <p className="text-sm font-bold text-white">Historial reciente</p>
                <p className="mt-1 text-xs text-white/35">Solo se guardan nombres y fechas en este navegador; tus videos no se almacenan aquí.</p>
              </div>
            </div>
            <button type="button" onClick={clearHistory} className="inline-flex items-center gap-1.5 self-start text-xs font-bold text-white/45 transition hover:text-white sm:self-auto"><RotateCcw className="h-3.5 w-3.5" /> Limpiar historial</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {history.map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-black/10 px-3 py-3">
                <p className="truncate text-xs font-bold text-white/75" title={item.filename}>{item.filename}</p>
                <p className="mt-1 text-[11px] text-white/35">{item.count} {item.count === 1 ? 'video' : 'videos'} · {new Date(item.createdAt).toLocaleDateString('es-DO')}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      <footer className="studio-footer"><span>DOWNLOADER / PRO</span><span>Tu próximo video empieza aquí.</span></footer>
      </main>
    </div>
  );
}

"use client";

import { useState } from 'react';
import axios from 'axios';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Circle,
  Clipboard,
  Download,
  Facebook,
  Instagram,
  Layers3,
  Link2,
  Loader2,
  Play,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap,
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

const featureCards = [
  { icon: Zap, label: 'Extracción rápida', detail: 'Enlaces directos' },
  { icon: Layers3, label: 'Modo batch', detail: 'Varios enlaces' },
  { icon: ShieldCheck, label: 'Flujo simple', detail: 'Sin registro' },
];

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
  };

  const parseUrls = (input: string): string[] => {
    return input
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

  const handleDownload = async () => {
    if (selectedIds.size === 0) return;
    setDownloading(true);
    setProgress(0);
    setDownloadedCount(0);

    const selectedVideos = videos.filter((video) => selectedIds.has(video.id));

    try {
      for (let i = 0; i < selectedVideos.length; i++) {
        const video = selectedVideos[i];
        const filename = `${video.platform}_${video.id.substring(0, 8)}.mp4`;
        const link = document.createElement('a');
        link.href = video.playUrl;
        link.download = filename;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setDownloadedCount(i + 1);
        setProgress(Math.round(((i + 1) / selectedVideos.length) * 100));

        if (i < selectedVideos.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    } catch {
      setError('Error al descargar los videos.');
    } finally {
      setDownloading(false);
      setProgress(0);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#080a12] text-white selection:bg-purple-300 selection:text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(168,85,247,0.16),transparent_34%),radial-gradient(circle_at_90%_10%,rgba(59,130,246,0.14),transparent_30%),linear-gradient(180deg,#080a12_0%,#0d1020_52%,#080a12_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,0.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.7)_1px,transparent_1px)] [background-size:64px_64px]" />

      <header className="relative z-20 border-b border-white/[0.08] bg-[#080a12]/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <a href="#top" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-400 shadow-lg shadow-violet-500/20">
              <Play className="h-5 w-5 fill-white text-white" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-[0.2em] text-white/45 uppercase">Social media</span>
              <span className="block text-base font-bold tracking-tight text-white">Downloader Pro</span>
            </span>
          </a>

          <div className="hidden items-center gap-3 sm:flex">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1.5 text-xs font-semibold text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.9)]" />
              Sistema listo
            </span>
            <a href="#workspace" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-white/75 transition hover:border-white/20 hover:bg-white/[0.09] hover:text-white">
              Abrir workspace <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </header>

      <main id="top" className="relative z-10 mx-auto max-w-7xl px-5 pb-40 pt-12 lg:px-8 lg:pt-20">
        <section className="grid items-end gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/[0.08] px-3.5 py-2 text-xs font-semibold tracking-[0.14em] text-violet-200 uppercase">
              <Sparkles className="h-3.5 w-3.5 text-fuchsia-300" />
              Tu contenido, a tu ritmo
            </div>
            <h1 className="max-w-4xl text-5xl font-black leading-[0.98] tracking-[-0.055em] text-white sm:text-6xl lg:text-8xl">
              Descarga.
              <span className="block bg-gradient-to-r from-fuchsia-300 via-violet-300 to-cyan-300 bg-clip-text text-transparent">Guarda.</span>
              <span className="block text-white/90">Repite.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-white/55 sm:text-lg">
              Un espacio limpio para convertir enlaces de TikTok, Instagram y Facebook en descargas directas, sin pasos innecesarios.
            </p>

            <div className="mt-9 grid max-w-xl grid-cols-3 gap-3 border-t border-white/10 pt-5">
              <div>
                <p className="text-2xl font-black tracking-tight text-white">03</p>
                <p className="mt-1 text-[10px] font-semibold tracking-[0.16em] text-white/35 uppercase">Plataformas</p>
              </div>
              <div>
                <p className="text-2xl font-black tracking-tight text-white">HD</p>
                <p className="mt-1 text-[10px] font-semibold tracking-[0.16em] text-white/35 uppercase">Calidad lista</p>
              </div>
              <div>
                <p className="text-2xl font-black tracking-tight text-white">∞</p>
                <p className="mt-1 text-[10px] font-semibold tracking-[0.16em] text-white/35 uppercase">Flujo simple</p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-8">
            <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-violet-500/20 blur-3xl" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold tracking-[0.2em] text-white/35 uppercase">Workspace status</span>
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-white/45 uppercase">Live</span>
              </div>
              <div className="mt-9 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/30 to-cyan-400/20 ring-1 ring-white/10">
                  <Download className="h-6 w-6 text-cyan-200" />
                </div>
                <div>
                  <p className="text-lg font-bold text-white">Listo para extraer</p>
                  <p className="mt-1 text-sm text-white/45">Pega tus enlaces para comenzar</p>
                </div>
              </div>
              <div className="mt-9 space-y-3">
                {['Analiza el enlace', 'Prepara la descarga', 'Guarda el contenido'].map((step, index) => (
                  <div key={step} className="flex items-center gap-3 text-sm text-white/65">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${index === 0 ? 'bg-violet-400 text-slate-950' : 'border border-white/10 bg-white/[0.04] text-white/30'}`}>
                      {index === 0 ? <Check className="h-3.5 w-3.5" /> : index + 1}
                    </span>
                    {step}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="workspace" className="mt-16 grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#111522]/90 shadow-2xl shadow-black/25 backdrop-blur-xl">
            <div className="border-b border-white/[0.08] px-6 py-6 sm:px-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="mb-3 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-violet-300 uppercase">
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-300" />
                    01 / Add sources
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Pega tus enlaces</h2>
                  <p className="mt-2 text-sm leading-6 text-white/45">Uno o varios enlaces separados por coma o salto de línea.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-white/40">
                  <Link2 className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-7 flex flex-wrap gap-2">
                {(['tiktok', 'instagram', 'facebook'] as Platform[]).map((platform) => (
                  <span key={platform} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-semibold text-white/55">
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
                  className="h-52 w-full resize-none rounded-2xl border border-white/10 bg-[#080a12]/80 p-5 text-sm leading-7 text-white/85 outline-none transition placeholder:text-white/20 focus:border-violet-400/60 focus:ring-4 focus:ring-violet-400/10"
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
                className="mt-5 flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400 px-6 py-4 text-base font-black text-white shadow-xl shadow-violet-500/20 transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-600 disabled:text-white/35 disabled:shadow-none"
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

          <div className="flex flex-col gap-4">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 backdrop-blur-xl sm:p-7">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold tracking-[0.2em] text-white/35 uppercase">Why it works</p>
                <Sparkles className="h-4 w-4 text-fuchsia-300" />
              </div>
              <h3 className="mt-5 max-w-sm text-2xl font-bold leading-tight tracking-tight text-white">Menos ruido. Más control sobre tus descargas.</h3>
              <p className="mt-3 text-sm leading-6 text-white/45">Un flujo pensado para pasar de un enlace a un archivo listo en pocos pasos.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {featureCards.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.label} className="flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-4 transition hover:border-white/15 hover:bg-white/[0.06]">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-400/10 text-violet-200 ring-1 ring-violet-300/10">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-white/85">{feature.label}</span>
                      <span className="mt-1 block text-xs text-white/35">{feature.detail}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {videos.length > 0 && (
          <section className="mt-16">
            <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <div className="mb-3 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-cyan-300 uppercase">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                  02 / Results
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
                      {video.cover ? (
                        <img src={video.cover} alt={video.title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_20%,rgba(139,92,246,0.42),transparent_48%),linear-gradient(135deg,#111827,#312e81)]">
                          <span className={`${platformColors[video.platform]} rounded-full p-5 text-white shadow-2xl`}>
                            {platformIcons[video.platform]}
                          </span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-transparent to-slate-950/10" />
                      <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/50 px-2.5 py-1.5 text-[10px] font-bold tracking-[0.12em] text-white/85 uppercase backdrop-blur-md">
                        {platformIcons[video.platform]}
                        {video.platform}
                      </span>
                      <span className={`absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-md ${isSelected ? 'bg-violet-400 text-slate-950' : 'border border-white/20 bg-slate-950/45 text-white/55'}`}>
                        {isSelected ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                      </span>
                      <span className="absolute bottom-4 left-4 inline-flex items-center gap-2 text-xs font-semibold text-white/80">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 backdrop-blur-md"><Play className="h-3.5 w-3.5 fill-white" /></span>
                        Vista previa disponible
                      </span>
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
      </main>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 rounded-[1.5rem] border border-white/15 bg-[#111522]/90 p-4 shadow-2xl shadow-black/40 backdrop-blur-2xl sm:bottom-8 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500/20 to-cyan-400/20 text-cyan-200 ring-1 ring-white/10">
                <Download className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-white">{selectedIds.size} {selectedIds.size === 1 ? 'video seleccionado' : 'videos seleccionados'}</p>
                <p className="mt-1 text-xs text-white/40">Descargas directas desde el navegador</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-black text-slate-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/40 sm:w-auto"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {downloading ? `${downloadedCount}/${selectedIds.size} procesados` : 'Descargar ahora'}
            </button>
          </div>
          {downloading && selectedIds.size > 1 && (
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-300 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

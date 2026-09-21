import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

export interface VideoEditSettings {
  trimStart: number;
  trimEnd: number;
  zoom: number;
  flip: boolean;
  speed: number;
  brightness: number;
  contrast: number;
  saturation: number;
  volume: number;
  fps: number | null;
}

interface ProcessVideoOptions {
  sourceUrl: string;
  settings: VideoEditSettings;
  onProgress?: (progress: number) => void;
}

interface ProcessedVideo {
  blob: Blob;
  duration: number;
}

let ffmpegPromise: Promise<FFmpeg> | null = null;

const CORE_BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
const MULTI_THREAD_CORE_BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/umd';

function getArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

async function getFfmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }] = await Promise.all([import('@ffmpeg/ffmpeg')]);
      const canUseMultithreading = window.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined';

      const loadFfmpeg = async (baseUrl: string, multithreaded: boolean) => {
        const ffmpeg = new FFmpeg();
        const coreSourceURL = `${baseUrl}/ffmpeg-core.js`;
        const wasmSourceURL = `${baseUrl}/ffmpeg-core.wasm`;
        const coreURL = multithreaded
          ? await toBlobURL(coreSourceURL, 'text/javascript')
          : coreSourceURL;
        const wasmURL = multithreaded
          ? await toBlobURL(wasmSourceURL, 'application/wasm')
          : wasmSourceURL;
        const workerURL = multithreaded
          ? await toBlobURL(`${baseUrl}/ffmpeg-core.worker.js`, 'text/javascript')
          : undefined;

        const loadOptions = workerURL
          ? { coreURL, wasmURL, workerURL }
          : { coreURL, wasmURL };
        const loadPromise = ffmpeg.load(loadOptions);
        await withTimeout(loadPromise, 60_000, 'FFmpeg tardó demasiado en iniciar. Recarga la página e inténtalo de nuevo.');
        return ffmpeg;
      };

      if (canUseMultithreading) {
        try {
          return await loadFfmpeg(MULTI_THREAD_CORE_BASE_URL, true);
        } catch {
          // Algunos navegadores o extensiones bloquean el worker multihilo; usamos el modo compatible.
        }
      }

      return loadFfmpeg(CORE_BASE_URL, false);
    })().catch((error) => {
      ffmpegPromise = null;
      throw error;
    });
  }

  return ffmpegPromise;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

async function getVideoDuration(data: Uint8Array): Promise<number> {
  const objectUrl = URL.createObjectURL(new Blob([getArrayBuffer(data)], { type: 'video/mp4' }));
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.src = objectUrl;

  return new Promise((resolve, reject) => {
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo leer la duración del video.'));
    };
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.trim();
  if (typeof error === 'string') return error.trim();
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message).trim();
  }
  return '';
}

export function sanitizeFilename(name: string) {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ _.-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, 90);

  return `${(cleaned || 'video_editado').replace(/\.mp4$/i, '')}.mp4`;
}

export async function processVideo({ sourceUrl, settings, onProgress }: ProcessVideoOptions): Promise<ProcessedVideo> {
  if (typeof window === 'undefined') {
    throw new Error('El editor de video solo puede ejecutarse en el navegador.');
  }

  onProgress?.(0.02);
  let response: Response;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 30_000);
  try {
    response = await fetch(sourceUrl, { mode: 'cors', signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('El proveedor tardó demasiado en responder. Prueba con otro video.');
    }
    throw new Error('Este enlace no permite edición directa desde el navegador. Prueba con otro video o descarga el original.');
  } finally {
    window.clearTimeout(timeoutId);
  }
  if (!response.ok) {
    throw new Error('El proveedor no permitió leer el video para editarlo.');
  }

  const sourceData = new Uint8Array(await response.arrayBuffer());
  const sourceDuration = await getVideoDuration(sourceData);
  const trimStart = clamp(settings.trimStart, 0, Math.max(0, sourceDuration - 0.25));
  const trimEnd = clamp(settings.trimEnd, 0, Math.max(0, sourceDuration - trimStart - 0.25));
  const outputDuration = sourceDuration - trimStart - trimEnd;

  if (!Number.isFinite(sourceDuration) || outputDuration <= 0.25) {
    throw new Error('El video es demasiado corto para aplicar este recorte.');
  }

  const ffmpeg = await getFfmpeg();
  const inputName = 'source.mp4';
  const outputName = 'edited.mp4';
  const zoomPercent = clamp(settings.zoom, 0, 10);
  const zoomFactor = 1 + zoomPercent / 100;
  const speed = clamp(settings.speed, 0.5, 2);
  const brightness = clamp(settings.brightness, -100, 100) / 100;
  const contrast = 1 + clamp(settings.contrast, -100, 100) / 100;
  const saturation = 1 + clamp(settings.saturation, -100, 100) / 100;
  const videoFilters = [
    zoomPercent > 0
      ? `scale=ceil(iw*${zoomFactor}/2)*2:ceil(ih*${zoomFactor}/2)*2,crop=trunc(iw/${zoomFactor}/2)*2:trunc(ih/${zoomFactor}/2)`
      : '',
    settings.flip ? 'hflip' : '',
    `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`,
    settings.fps ? `fps=${settings.fps}` : '',
    `setpts=PTS/${speed}`,
  ].filter(Boolean).join(',');
  const audioFilters = [`atempo=${speed}`, `volume=${clamp(settings.volume, 0, 200) / 100}`].join(',');

  const progressListener = ({ progress }: { progress: number }) => {
    onProgress?.(0.12 + Math.max(0, Math.min(progress, 1)) * 0.84);
  };
  let lastFfmpegMessage = '';
  const logListener = ({ message }: { message: string }) => {
    if (message.trim()) lastFfmpegMessage = message.trim();
  };
  ffmpeg.on('progress', progressListener);
  ffmpeg.on('log', logListener);

  try {
    await ffmpeg.writeFile(inputName, sourceData);
    const renderTimeoutMs = Math.min(300_000, Math.max(180_000, 120_000 + sourceDuration * 4_000));
    const renderTimeoutMessage = 'La exportación está tardando más de lo esperado. Puedes reintentarlo con un clip más corto o menor resolución.';
    const execPromise = ffmpeg.exec([
      '-ss', String(trimStart),
      '-i', inputName,
      '-t', String(outputDuration),
      '-map', '0:v:0',
      '-map', '0:a?',
      '-vf', videoFilters,
      '-af', audioFilters,
      '-c:v', 'libx264',
      '-threads', '0',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputName,
    ]);
    // Si el tiempo límite vence, evitamos una promesa rechazada sin manejar mientras reiniciamos FFmpeg.
    execPromise.catch(() => undefined);

    let exitCode: number;
    try {
      exitCode = await withTimeout(execPromise, renderTimeoutMs, renderTimeoutMessage);
    } catch (error) {
      if (error instanceof Error && error.message === renderTimeoutMessage) {
        ffmpeg.terminate();
        ffmpegPromise = null;
      }
      throw error;
    }

    if (exitCode !== 0) {
      throw new Error(lastFfmpegMessage
        ? `FFmpeg no pudo exportar el video: ${lastFfmpegMessage}`
        : 'FFmpeg no pudo exportar el video.');
    }

    const outputData = await ffmpeg.readFile(outputName);
    if (typeof outputData === 'string') {
      throw new Error('FFmpeg devolvió un formato de salida no válido.');
    }
    onProgress?.(1);

    return {
      blob: new Blob([getArrayBuffer(outputData)], { type: 'video/mp4' }),
      duration: outputDuration / speed,
    };
  } catch (error) {
    if (error instanceof Error) throw error;
    const message = readErrorMessage(error);
    throw new Error(message || lastFfmpegMessage || 'FFmpeg no pudo exportar el video.');
  } finally {
    ffmpeg.off('progress', progressListener);
    ffmpeg.off('log', logListener);
    await Promise.allSettled([
      ffmpeg.deleteFile(inputName),
      ffmpeg.deleteFile(outputName),
    ]);
  }
}

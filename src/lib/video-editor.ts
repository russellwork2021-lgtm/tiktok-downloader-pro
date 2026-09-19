import type { FFmpeg } from '@ffmpeg/ffmpeg';

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

const CORE_BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';

function getArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

async function getFfmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ]);
      const ffmpeg = new FFmpeg();

      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.worker.js`, 'text/javascript'),
      });

      return ffmpeg;
    })();
  }

  return ffmpegPromise;
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
  try {
    response = await fetch(sourceUrl, { mode: 'cors' });
  } catch {
    throw new Error('Este enlace no permite edición directa desde el navegador. Prueba con otro video o descarga el original.');
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
  const zoomFactor = 1 + clamp(settings.zoom, 0, 30) / 100;
  const speed = clamp(settings.speed, 0.5, 2);
  const brightness = clamp(settings.brightness, -100, 100) / 100;
  const contrast = 1 + clamp(settings.contrast, -100, 100) / 100;
  const saturation = 1 + clamp(settings.saturation, -100, 100) / 100;
  const videoFilters = [
    `scale=ceil(iw*${zoomFactor}/2)*2:ceil(ih*${zoomFactor}/2)*2`,
    `crop=trunc(iw/${zoomFactor}/2)*2:trunc(ih/${zoomFactor}/2)`,
    settings.flip ? 'hflip' : '',
    `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`,
    settings.fps ? `fps=${settings.fps}` : '',
    `setpts=PTS/${speed}`,
  ].filter(Boolean).join(',');
  const audioFilters = [`atempo=${speed}`, `volume=${clamp(settings.volume, 0, 200) / 100}`].join(',');

  ffmpeg.on('progress', ({ progress }) => onProgress?.(0.12 + Math.max(0, Math.min(progress, 1)) * 0.84));
  await ffmpeg.writeFile(inputName, sourceData);

  try {
    const exitCode = await ffmpeg.exec([
      '-ss', String(trimStart),
      '-i', inputName,
      '-t', String(outputDuration),
      '-map', '0:v:0',
      '-map', '0:a?',
      '-vf', videoFilters,
      '-af', audioFilters,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputName,
    ]);

    if (exitCode !== 0) {
      throw new Error('FFmpeg no pudo exportar el video.');
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
  } finally {
    await Promise.allSettled([
      ffmpeg.deleteFile(inputName),
      ffmpeg.deleteFile(outputName),
    ]);
  }
}

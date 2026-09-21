import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const WEB_ORIGIN = process.env.WEB_ORIGIN || '*';
const TEMP_DIR = process.env.TEMP_DIR || join(process.cwd(), '.tmp');
const MAX_SOURCE_BYTES = Number(process.env.MAX_SOURCE_BYTES || 80 * 1024 * 1024);
const MAX_DURATION_SECONDS = Number(process.env.MAX_DURATION_SECONDS || 180);
const MAX_BODY_BYTES = 256 * 1024;
const SOURCE_TIMEOUT_MS = Number(process.env.SOURCE_TIMEOUT_MS || 45_000);
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS || 300_000);
const MAX_CONCURRENT_JOBS = Number(process.env.MAX_CONCURRENT_JOBS || 2);
const PROCESSOR_API_KEY = process.env.PROCESSOR_API_KEY || '';
const ALLOW_LOCAL_SOURCES = process.env.ALLOW_LOCAL_SOURCES === 'true';

let activeJobs = 0;

const DEFAULT_ALLOWED_DOMAINS = [
  'tiktok.com',
  'tiktokcdn.com',
  'tiktokv.com',
  'tiktokio.com',
  'muscdn.com',
  'instagram.com',
  'cdninstagram.com',
  'facebook.com',
  'fbcdn.net',
  'fbsbx.com',
];

function configuredDomains() {
  const configured = (process.env.ALLOWED_SOURCE_HOSTS || '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);

  return configured.length > 0 ? configured : DEFAULT_ALLOWED_DOMAINS;
}

function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...corsHeaders(),
  });
  res.end(body);
}

function corsHeaders(origin) {
  const allowedOrigin = WEB_ORIGIN === '*' ? '*' : origin === WEB_ORIGIN ? WEB_ORIGIN : WEB_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Video-Processor-Key',
    'Access-Control-Expose-Headers': 'Content-Disposition, X-Video-Duration',
    'Vary': 'Origin',
  };
}

function isAllowedSource(url) {
  if (ALLOW_LOCAL_SOURCES && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
    return true;
  }

  return configuredDomains().some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
}

function parseSourceUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WorkerError(400, 'SOURCE_URL_REQUIRED', 'Falta la URL del video.');
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new WorkerError(400, 'SOURCE_URL_INVALID', 'La URL del video no es válida.');
  }

  if (url.protocol !== 'https:' && !(ALLOW_LOCAL_SOURCES && url.protocol === 'http:')) {
    throw new WorkerError(400, 'SOURCE_PROTOCOL_INVALID', 'Solo se permiten enlaces HTTPS de proveedores compatibles.');
  }

  if (!isAllowedSource(url)) {
    throw new WorkerError(400, 'SOURCE_HOST_INVALID', 'El proveedor del video no está permitido.');
  }

  return url;
}

function numberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeSettings(raw) {
  const settings = raw && typeof raw === 'object' ? raw : {};
  return {
    trimStart: clamp(numberOr(settings.trimStart, 0), 0, 10),
    trimEnd: clamp(numberOr(settings.trimEnd, 0), 0, 10),
    zoom: clamp(numberOr(settings.zoom, 0), 0, 10),
    flip: settings.flip === true,
    speed: clamp(numberOr(settings.speed, 1), 0.5, 2),
    brightness: clamp(numberOr(settings.brightness, 0), -100, 100),
    contrast: clamp(numberOr(settings.contrast, 0), -100, 100),
    saturation: clamp(numberOr(settings.saturation, 0), -100, 100),
    volume: clamp(numberOr(settings.volume, 100), 0, 200),
    fps: settings.fps === null || settings.fps === undefined
      ? null
      : clamp(numberOr(settings.fps, 30), 1, 120),
  };
}

function safeFilename(value) {
  const cleaned = String(value || 'video_editado')
    .trim()
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ _.-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/\.mp4$/i, '')
    .slice(0, 90);

  return `${cleaned || 'video_editado'}.mp4`;
}

class WorkerError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function readJson(req) {
  let size = 0;
  const chunks = [];

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new WorkerError(413, 'REQUEST_TOO_LARGE', 'La solicitud de procesamiento es demasiado grande.');
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new WorkerError(400, 'JSON_INVALID', 'La solicitud no tiene un formato válido.');
  }
}

async function downloadSource(url, destination) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 TikTokDownloaderPro/1.0',
        'Accept': 'video/*,*/*;q=0.8',
      },
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new WorkerError(504, 'SOURCE_TIMEOUT', 'El proveedor tardó demasiado en entregar el video.');
    }
    throw new WorkerError(502, 'SOURCE_FETCH_FAILED', 'No se pudo descargar el video del proveedor.');
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok || !response.body) {
    throw new WorkerError(502, 'SOURCE_NOT_AVAILABLE', 'El video ya no está disponible o el proveedor rechazó la descarga.');
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_SOURCE_BYTES) {
    throw new WorkerError(413, 'SOURCE_TOO_LARGE', 'El video supera el límite de tamaño permitido.');
  }

  const output = createWriteStream(destination, { flags: 'wx' });
  let bytes = 0;

  try {
    for await (const chunk of Readable.fromWeb(response.body)) {
      bytes += chunk.length;
      if (bytes > MAX_SOURCE_BYTES) {
        throw new WorkerError(413, 'SOURCE_TOO_LARGE', 'El video supera el límite de tamaño permitido.');
      }
      if (!output.write(chunk)) await once(output, 'drain');
    }
    output.end();
    await once(output, 'close');
  } catch (error) {
    output.destroy();
    throw error instanceof WorkerError
      ? error
      : new WorkerError(502, 'SOURCE_STREAM_FAILED', 'La descarga del video se interrumpió.');
  }

  if (bytes === 0) {
    throw new WorkerError(502, 'SOURCE_EMPTY', 'El proveedor devolvió un archivo vacío.');
  }

  return bytes;
}

function runCommand(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new WorkerError(504, 'PROCESSING_TIMEOUT', 'La exportación tardó más de lo permitido.'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error.code === 'ENOENT') {
        reject(new WorkerError(500, 'FFMPEG_NOT_INSTALLED', 'El servicio de video no tiene FFmpeg instalado.'));
      } else {
        reject(new WorkerError(500, 'PROCESS_FAILED', 'No se pudo iniciar el procesamiento del video.'));
      }
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new WorkerError(422, 'FFMPEG_FAILED', stderr.trim() || 'FFmpeg no pudo exportar el video.'));
      }
    });
  });
}

async function getDuration(inputPath) {
  const result = await runCommand('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    inputPath,
  ], 30_000);
  const duration = Number.parseFloat(result.stdout.trim());

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new WorkerError(422, 'VIDEO_METADATA_INVALID', 'No se pudo leer la duración del video.');
  }
  if (duration > MAX_DURATION_SECONDS) {
    throw new WorkerError(413, 'VIDEO_TOO_LONG', `El video supera el límite de ${MAX_DURATION_SECONDS} segundos.`);
  }

  return duration;
}

function buildFfmpegArgs(inputPath, outputPath, duration, settings) {
  const trimStart = clamp(settings.trimStart, 0, Math.max(0, duration - 0.25));
  const trimEnd = clamp(settings.trimEnd, 0, Math.max(0, duration - trimStart - 0.25));
  const outputDuration = duration - trimStart - trimEnd;
  if (outputDuration <= 0.25) {
    throw new WorkerError(422, 'VIDEO_TOO_SHORT', 'El video es demasiado corto para aplicar este recorte.');
  }

  const zoomFactor = 1 + settings.zoom / 100;
  const videoFilters = [
    settings.zoom > 0
      ? `scale=ceil(iw*${zoomFactor}/2)*2:ceil(ih*${zoomFactor}/2)*2,crop=trunc(iw/${zoomFactor}/2)*2:trunc(ih/${zoomFactor}/2)`
      : '',
    settings.flip ? 'hflip' : '',
    `eq=brightness=${settings.brightness / 100}:contrast=${1 + settings.contrast / 100}:saturation=${1 + settings.saturation / 100}`,
    settings.fps ? `fps=${settings.fps}` : '',
    `setpts=PTS/${settings.speed}`,
  ].filter(Boolean).join(',');

  return {
    args: [
      '-hide_banner',
      '-loglevel', 'error',
      '-nostdin',
      '-ss', String(trimStart),
      '-i', inputPath,
      '-t', String(outputDuration),
      '-map', '0:v:0',
      '-map', '0:a?',
      '-vf', videoFilters,
      '-af', `atempo=${settings.speed},volume=${settings.volume / 100}`,
      '-c:v', 'libx264',
      '-threads', '0',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ],
    outputDuration: outputDuration / settings.speed,
  };
}

async function processVideo(body, jobId) {
  const sourceUrl = parseSourceUrl(body?.sourceUrl);
  const settings = normalizeSettings(body?.settings);
  const inputPath = join(TEMP_DIR, `${jobId}-source.mp4`);
  const outputPath = join(TEMP_DIR, `${jobId}-edited.mp4`);

  await downloadSource(sourceUrl, inputPath);
  const duration = await getDuration(inputPath);
  const command = buildFfmpegArgs(inputPath, outputPath, duration, settings);
  await runCommand('ffmpeg', command.args, JOB_TIMEOUT_MS);

  const outputStats = await stat(outputPath);
  if (outputStats.size === 0) {
    throw new WorkerError(422, 'OUTPUT_EMPTY', 'FFmpeg generó un archivo vacío.');
  }

  return { inputPath, outputPath, outputDuration: command.outputDuration, outputSize: outputStats.size };
}

async function handleProcess(req, res) {
  if (PROCESSOR_API_KEY && req.headers['x-video-processor-key'] !== PROCESSOR_API_KEY) {
    jsonResponse(res, 401, { code: 'UNAUTHORIZED', error: 'No autorizado.' });
    return;
  }
  if (activeJobs >= MAX_CONCURRENT_JOBS) {
    jsonResponse(res, 429, { code: 'WORKER_BUSY', error: 'El procesador está ocupado. Inténtalo nuevamente en unos segundos.' });
    return;
  }

  activeJobs += 1;
  const jobId = randomUUID();
  try {
    const body = await readJson(req);
    const result = await processVideo(body, jobId);
    const filename = safeFilename(body?.filename);
    const stream = createReadStream(result.outputPath);
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': result.outputSize,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Video-Duration': String(result.outputDuration),
      ...corsHeaders(req.headers.origin),
    });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
    await once(stream, 'close');
  } catch (error) {
    const workerError = error instanceof WorkerError
      ? error
      : new WorkerError(500, 'WORKER_ERROR', 'No se pudo procesar el video.');
    if (!res.headersSent) {
      jsonResponse(res, workerError.status, { code: workerError.code, error: workerError.message });
    } else {
      res.destroy();
    }
    console.error(`[${jobId}] ${workerError.code}: ${workerError.message}`);
  } finally {
    await Promise.allSettled([
      rm(join(TEMP_DIR, `${jobId}-source.mp4`), { force: true }),
      rm(join(TEMP_DIR, `${jobId}-edited.mp4`), { force: true }),
    ]);
    activeJobs -= 1;
  }
}

async function start() {
  await mkdir(TEMP_DIR, { recursive: true });
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(req.headers.origin));
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      jsonResponse(res, 200, { ok: true, service: 'video-worker', ffmpeg: true, activeJobs });
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/process') {
      await handleProcess(req, res);
      return;
    }

    jsonResponse(res, 404, { code: 'NOT_FOUND', error: 'Ruta no encontrada.' });
  });

  server.requestTimeout = JOB_TIMEOUT_MS + SOURCE_TIMEOUT_MS + 30_000;
  server.headersTimeout = 30_000;
  server.listen(PORT, HOST, () => {
    console.log(`Video worker listening on http://${HOST}:${PORT}`);
    console.log(`Allowed source domains: ${configuredDomains().join(', ')}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

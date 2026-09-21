# Video worker nativo

Este servicio procesa el video con FFmpeg nativo. Se usa para evitar las limitaciones del FFmpeg WebAssembly del navegador, especialmente con videos HEVC y lotes de varios clips.

## Ejecutar localmente

Requiere Node.js 20 o superior y `ffmpeg`/`ffprobe` disponibles en el `PATH`.

```powershell
$env:ALLOW_LOCAL_SOURCES = 'false'
$env:WEB_ORIGIN = 'http://localhost:3000'
npm start
```

El servicio queda disponible en `http://localhost:8787` y expone:

- `GET /health`
- `POST /v1/process`

El endpoint recibe `{ sourceUrl, settings }` y devuelve un MP4 editado. Las URLs se limitan a proveedores de video conocidos, el tamaño por defecto es 80 MB y la duración máxima por defecto es 180 segundos.

## Docker

```bash
docker build -t tiktok-video-worker ./video-worker
docker run --rm -p 8787:8787 \
  -e WEB_ORIGIN=https://tiktok-downloader-pro-alpha.vercel.app \
  tiktok-video-worker
```

Para producción se debe configurar `WEB_ORIGIN` con el dominio real de la aplicación. También se puede establecer `PROCESSOR_API_KEY`; si se hace, hay que configurar el mismo valor en Vercel como `NEXT_PUBLIC_VIDEO_PROCESSOR_KEY`.

## Conectar la aplicación

En Vercel, añade la variable `NEXT_PUBLIC_VIDEO_PROCESSOR_URL` con la URL pública del worker, por ejemplo `https://video-worker.example.com`, y vuelve a desplegar. Cuando está definida, la aplicación usa el worker nativo para la vista previa y para `Descargar editados`; si no está definida, conserva el editor del navegador como compatibilidad local.

import { NextResponse } from 'next/server';
import { ttdl, igdl, fbdown } from 'ab-downloader';

function detectPlatform(url: string): 'tiktok' | 'instagram' | 'facebook' | null {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }

  if (hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com')) return 'tiktok';
  if (hostname === 'instagram.com' || hostname.endsWith('.instagram.com')) return 'instagram';
  if (hostname === 'facebook.com' || hostname.endsWith('.facebook.com') || hostname === 'fb.watch') return 'facebook';
  return null;
}

function platformName(platform: 'tiktok' | 'instagram' | 'facebook') {
  return platform[0].toUpperCase() + platform.slice(1);
}

function unavailableMessage(platform: 'tiktok' | 'instagram' | 'facebook') {
  return `No se pudo obtener este video de ${platformName(platform)}. Verifica que el enlace sea público, siga disponible y no requiera iniciar sesión.`;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function normalizeMediaUrl(value: unknown): string {
  if (Array.isArray(value)) {
    return value.find((item): item is string => typeof item === 'string' && item.length > 0) || '';
  }

  return typeof value === 'string' ? value : '';
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (typeof url !== 'string' || !url.trim()) {
      return NextResponse.json({ error: 'Pega un enlace de TikTok, Instagram o Facebook para comenzar.' }, { status: 400 });
    }

    const normalizedUrl = url.trim();
    const platform = detectPlatform(normalizedUrl);

    if (!platform) {
      return NextResponse.json({ 
        error: 'Enlace no compatible. Usa una URL pública de TikTok, Instagram o Facebook.'
      }, { status: 400 });
    }

    let result;

    if (platform === 'tiktok') {
      const data = await ttdl(normalizedUrl);
      if (data.status === false) {
        return NextResponse.json({ error: unavailableMessage(platform) }, { status: 422 });
      }
      result = {
        id: generateId(),
        platform: 'tiktok',
        title: data.title || 'Video de TikTok',
        cover: data.thumbnail || '',
        playUrl: normalizeMediaUrl(data.video),
        author: 'tiktok_user',
        duration: 0
      };
    } else if (platform === 'instagram') {
      const data = await igdl(normalizedUrl);
      if (!Array.isArray(data)) {
        return NextResponse.json({ error: unavailableMessage(platform) }, { status: 422 });
      }
      const media = data[0];
      result = {
        id: generateId(),
        platform: 'instagram',
        title: `Post de Instagram ${new Date().toLocaleDateString()}`,
        cover: media?.thumbnail || '',
        playUrl: normalizeMediaUrl(media?.url),
        author: 'instagram_user',
        duration: 0
      };
    } else if (platform === 'facebook') {
      const data = await fbdown(normalizedUrl);
      if (!data.HD && !data.Normal_video) {
        return NextResponse.json({ error: unavailableMessage(platform) }, { status: 422 });
      }
      result = {
        id: generateId(),
        platform: 'facebook',
        title: `Video de Facebook ${new Date().toLocaleDateString()}`,
        cover: '',
        playUrl: normalizeMediaUrl(data.HD || data.Normal_video),
        author: 'facebook_user',
        duration: 0
      };
    }

    if (!result?.playUrl) {
      return NextResponse.json({ error: unavailableMessage(platform) }, { status: 422 });
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Download API Error:', error);
    return NextResponse.json({ 
      error: 'El servicio no pudo procesar este enlace. Comprueba que sea público e inténtalo nuevamente.'
    }, { status: 502 });
  }
}

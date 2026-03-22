import { NextResponse } from 'next/server';
import { ttdl, igdl, fbdown } from 'ab-downloader';

function detectPlatform(url: string): 'tiktok' | 'instagram' | 'facebook' | null {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('tiktok.com') || lowerUrl.includes('vm.tiktok') || lowerUrl.includes('vt.tiktok')) return 'tiktok';
  if (lowerUrl.includes('instagram.com')) return 'instagram';
  if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch')) return 'facebook';
  return null;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const platform = detectPlatform(url);

    if (!platform) {
      return NextResponse.json({ 
        error: 'URL no soportada. Usa enlaces de TikTok, Instagram o Facebook.' 
      }, { status: 400 });
    }

    let result;

    if (platform === 'tiktok') {
      const data = await ttdl(url);
      if (data.status === false) {
        return NextResponse.json({ error: data.message || 'Error al descargar TikTok' }, { status: 500 });
      }
      result = {
        id: generateId(),
        platform: 'tiktok',
        title: data.title || 'Video de TikTok',
        cover: data.thumbnail || '',
        playUrl: data.video || '',
        author: 'tiktok_user',
        duration: 0
      };
    } else if (platform === 'instagram') {
      const data = await igdl(url);
      if (!Array.isArray(data)) {
        return NextResponse.json({ error: data.message || 'Error al descargar Instagram' }, { status: 500 });
      }
      const media = data[0];
      result = {
        id: generateId(),
        platform: 'instagram',
        title: `Post de Instagram ${new Date().toLocaleDateString()}`,
        cover: media?.thumbnail || '',
        playUrl: media?.url || '',
        author: 'instagram_user',
        duration: 0
      };
    } else if (platform === 'facebook') {
      const data = await fbdown(url);
      if (!data.HD && !data.Normal_video) {
        return NextResponse.json({ error: data.message || 'Error al descargar Facebook' }, { status: 500 });
      }
      result = {
        id: generateId(),
        platform: 'facebook',
        title: `Video de Facebook ${new Date().toLocaleDateString()}`,
        cover: '',
        playUrl: data.HD || data.Normal_video || '',
        author: 'facebook_user',
        duration: 0
      };
    }

    if (!result?.playUrl) {
      return NextResponse.json({ error: 'No se pudo obtener el video. Intenta con otro enlace.' }, { status: 500 });
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Download API Error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Error al procesar el video. Intenta más tarde.' 
    }, { status: 500 });
  }
}

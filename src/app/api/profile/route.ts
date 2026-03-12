import { NextResponse } from 'next/server';
import { ApifyClient } from 'apify-client';

const APIFY_TOKEN = process.env.APIFY_TOKEN || '';

export async function POST(req: Request) {
  try {
    const { username } = await req.json();
    
    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const cleanUsername = username.replace('@', '');

    try {
      // Intento primario con Apify usando el token proporcionado
      const client = new ApifyClient({ token: APIFY_TOKEN });
      
      const run = await client.actor("clockworks/tiktok-scraper").call({
          profiles: [cleanUsername],
          resultsPerPage: 30,
          shouldDownloadVideos: true, // Esto nos da la URL limpia de descarga
          shouldDownloadCovers: false,
          shouldDownloadSubtitles: false,
          shouldDownloadSlideshowImages: false
      });

      const { items } = await client.dataset(run.defaultDatasetId).listItems();

      if (items.length > 0) {
        const videos = items
          .filter(vid => (vid.videoMeta as any)?.downloadAddr || vid.videoUrl)
          .map((vid: any) => ({
            id: vid.id,
            title: vid.text || `Video de @${cleanUsername}`,
            cover: (vid.videoMeta as any)?.coverUrl || (vid.authorMeta as any)?.avatar,
            playUrl: (vid.videoMeta as any)?.downloadAddr || vid.videoUrl, // URL sin marca de agua
            author: cleanUsername
        }));

        if (videos.length > 0) {
          return NextResponse.json({ videos });
        }
      }
    } catch (apifyError) {
      console.error('Apify scraping failed:', apifyError);
      // Fallback a TikWM if Apify fails...
    }

    // Fallback a TikWM
    const apiUrl = `https://tikwm.com/api/user/posts?unique_id=${encodeURIComponent(cleanUsername)}&count=15`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const text = await response.text();
    
    if (text.includes('Just a moment...') || text.includes('cf-browser-verification') || text.includes('captcha')) {
      return NextResponse.json({ 
        error: 'TikTok/Cloudflare ha bloqueado temporalmente la extracción masiva de perfiles de forma gratuita. Por favor, pega los enlaces de los videos individualmente o en bloque.',
        blocked: true
      }, { status: 403 });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch(e) {
      return NextResponse.json({ error: 'Respuesta inválida de la API' }, { status: 500 });
    }

    if (data.code !== 0 || !data.data || !data.data.videos) {
      return NextResponse.json({ error: data.msg || 'No se pudieron obtener los videos del perfil' }, { status: 500 });
    }

    const videos = data.data.videos.map((vid: any) => ({
      id: vid.video_id,
      title: vid.title,
      cover: vid.cover,
      playUrl: vid.play,
      author: cleanUsername
    }));

    return NextResponse.json({ videos });

  } catch (error) {
    console.error('Profile API Error:', error);
    return NextResponse.json({ error: 'Error al procesar el perfil. Intenta con URLs individuales.' }, { status: 500 });
  }
}

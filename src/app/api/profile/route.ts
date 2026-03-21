import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { username } = await req.json();
    
    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const cleanUsername = username.replace('@', '');
    const APIFY_TOKEN = process.env.APIFY_TOKEN;

    if (!APIFY_TOKEN) {
      return NextResponse.json({ error: 'El administrador no ha configurado el token de la API (APIFY_TOKEN) en Vercel.' }, { status: 500 });
    }

    try {
      const runRes = await fetch(`https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs?token=${APIFY_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profiles: [cleanUsername],
          resultsPerPage: 100,
          shouldDownloadVideos: true,
          shouldDownloadCovers: false,
          shouldDownloadSubtitles: false,
          shouldDownloadSlideshowImages: false
        })
      });

      const runData = await runRes.json();
      
      if (!runRes.ok) {
        throw new Error(runData.error?.message || 'Failed to start Apify run');
      }

      const runId = runData.data.id;
      const datasetId = runData.data.defaultDatasetId;

      let status = 'RUNNING';
      let retries = 0;
      
      while (status !== 'SUCCEEDED' && status !== 'FAILED' && retries < 20) {
        await new Promise(r => setTimeout(r, 2000));
        const checkRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
        const checkData = await checkRes.json();
        status = checkData.data.status;
        retries++;
      }

      if (status !== 'SUCCEEDED') {
        return NextResponse.json({ error: 'La extracción tardó demasiado. Intenta de nuevo.' }, { status: 408 });
      }

      const dsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&clean=true`);
      const items = await dsRes.json();

      if (items.length > 0) {
        const videos = items
          .filter((vid: any) => vid.videoMeta?.downloadAddr)
          .map((vid: any) => ({
            id: vid.id,
            title: vid.text || `Video de @${cleanUsername}`,
            cover: vid.videoMeta?.coverUrl || vid.authorMeta?.avatar,
            playUrl: vid.videoMeta?.downloadAddr,
            author: cleanUsername
        }));

        if (videos.length > 0) {
          return NextResponse.json({ videos, total: videos.length });
        }
      }
      
      return NextResponse.json({ error: 'No se encontraron videos descargables para este perfil.' }, { status: 404 });

    } catch (apifyError: any) {
      return NextResponse.json({ error: `Error: ${apifyError.message}` }, { status: 500 });
    }

  } catch (error) {
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { username } = await req.json();
    
    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const cleanUsername = username.replace('@', '');
    const APIFY_TOKEN = process.env.APIFY_TOKEN;

    if (APIFY_TOKEN) {
      try {
        console.log("Iniciando HTTP Apify para:", cleanUsername);
        
        const runRes = await fetch(`https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs?token=${APIFY_TOKEN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profiles: [cleanUsername],
            resultsPerPage: 700,
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
        
        console.log("Apify Run iniciado:", runId);

        let status = 'RUNNING';
        let retries = 0;
        
        while (status !== 'SUCCEEDED' && status !== 'FAILED' && retries < 60) {
          await new Promise(r => setTimeout(r, 3000));
          const checkRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
          const checkData = await checkRes.json();
          status = checkData.data.status;
          retries++;
          console.log("Estado del run:", status, "- Intento:", retries);
        }

        if (status === 'SUCCEEDED') {
          const dsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&clean=true`);
          const items = await dsRes.json();
          console.log("Videos encontrados:", items.length);

          if (items.length > 0) {
            const videos = items
              .filter((vid: any) => vid.videoMeta?.downloadAddr || vid.videoUrl)
              .map((vid: any) => ({
                id: vid.id,
                title: vid.text || `Video de @${cleanUsername}`,
                cover: vid.videoMeta?.coverUrl || vid.authorMeta?.avatar,
                playUrl: vid.videoMeta?.downloadAddr || vid.videoUrl,
                author: cleanUsername
            }));

            if (videos.length > 0) {
              return NextResponse.json({ videos, total: videos.length });
            }
          }
        }
        
        return NextResponse.json({ error: 'No se encontraron videos para este perfil. El perfil puede ser privado o no existir.' }, { status: 404 });

      } catch (apifyError: any) {
        console.error('Error HTTP Apify:', apifyError.message);
        return NextResponse.json({ error: `Error de Extracción: ${apifyError.message}` }, { status: 500 });
      }
    } else {
       return NextResponse.json({ error: 'El administrador no ha configurado el token de la API (APIFY_TOKEN) en Vercel.' }, { status: 500 });
    }

  } catch (error) {
    console.error('Profile API Error:', error);
    return NextResponse.json({ error: 'Error interno del servidor al procesar tu solicitud.' }, { status: 500 });
  }
}

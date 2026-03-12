import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Call TikWM API (a known free TikTok download API without watermark)
    const apiUrl = `https://tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch from TikWM: ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== 0 || !data.data) {
      return NextResponse.json({ error: data.msg || 'Failed to fetch video details' }, { status: 500 });
    }

    // Return the clean video details
    return NextResponse.json({
      id: data.data.id,
      title: data.data.title,
      cover: data.data.cover,
      playUrl: data.data.hdplay || data.data.play,
      author: data.data.author.nickname,
      authorId: data.data.author.unique_id,
      duration: data.data.duration
    });

  } catch (error) {
    console.error('Download API Error:', error);
    return NextResponse.json({ error: 'Failed to process request. Please try again later.' }, { status: 500 });
  }
}

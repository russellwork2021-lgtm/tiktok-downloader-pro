declare module 'ab-downloader' {
  interface TikTokResult {
    developer: string;
    status?: boolean;
    title?: string;
    title_audio?: string;
    thumbnail?: string;
    video?: string;
    audio?: string;
    message?: string;
    note?: string;
  }

  interface InstagramMedia {
    developer: string;
    contactme?: string;
    thumbnail?: string;
    url?: string;
    resolution?: string;
    shouldRender?: boolean;
  }

  interface InstagramResult {
    developer: string;
    status?: boolean;
    message?: string;
    note?: string;
    contactme?: string;
  }

  interface FacebookResult {
    developer: string;
    Normal_video?: string;
    HD?: string;
    status?: boolean;
    message?: string;
    note?: string;
    contactme?: string;
  }

  interface AIOResult {
    status?: boolean;
    url?: string;
    title?: string;
    thumbnail?: string;
  }

  interface TwitterResult {
    status?: boolean;
    title?: string;
    thumbnail?: string;
    video?: string;
  }

  interface YoutubeResult {
    status?: boolean;
    title?: string;
    thumbnail?: string;
    video?: string;
  }

  interface MediafireResult {
    status?: boolean;
    url?: string;
    filename?: string;
    size?: string;
  }

  interface CapcutResult {
    status?: boolean;
    url?: string;
  }

  interface GdriveResult {
    status?: boolean;
    url?: string;
    filename?: string;
  }

  interface PinterestResult {
    status?: boolean;
    url?: string;
    title?: string;
  }

  export function ttdl(url: string): Promise<TikTokResult>;
  export function igdl(url: string): Promise<InstagramMedia[] | InstagramResult>;
  export function fbdown(url: string): Promise<FacebookResult>;
  export function aio(url: string): Promise<AIOResult>;
  export function twitter(url: string): Promise<TwitterResult>;
  export function youtube(url: string): Promise<YoutubeResult>;
  export function mediafire(url: string): Promise<MediafireResult>;
  export function capcut(url: string): Promise<CapcutResult>;
  export function gdrive(url: string): Promise<GdriveResult>;
  export function pinterest(url: string): Promise<PinterestResult>;
}

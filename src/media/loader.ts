/** Runtime media elements keyed by object URL. */

export type MediaElement = HTMLImageElement | HTMLVideoElement;

const images = new Map<string, HTMLImageElement>();
const videos = new Map<string, HTMLVideoElement>();

export function revokeObjectUrl(url: string): void {
  if (!url) return;
  const img = images.get(url);
  if (img) {
    images.delete(url);
    img.src = '';
  }
  const vid = videos.get(url);
  if (vid) {
    videos.delete(url);
    vid.pause();
    vid.removeAttribute('src');
    vid.load();
  }
  URL.revokeObjectURL(url);
}

export function loadImageFromFile(file: File): Promise<{ url: string; element: HTMLImageElement }> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      images.set(url, img);
      resolve({ url, element: img });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image “${file.name}”`));
    };
    img.src = url;
  });
}

export function loadVideoFromFile(
  file: File,
  opts: { loop: boolean; muted: boolean },
): Promise<{ url: string; element: HTMLVideoElement }> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.playsInline = true;
    video.loop = opts.loop;
    video.muted = opts.muted;
    video.preload = 'auto';
    video.src = url;

    const onReady = (): void => {
      videos.set(url, video);
      video.play().catch(() => {
        /* autoplay may require a later gesture */
      });
      resolve({ url, element: video });
    };

    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener(
      'error',
      () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to load video “${file.name}”`));
      },
      { once: true },
    );
  });
}

export function getMediaElement(url: string): MediaElement | null {
  return images.get(url) ?? videos.get(url) ?? null;
}

/** Adopt an existing blob/object URL (e.g. shared from the editor window). */
export function adoptImageUrl(url: string): Promise<HTMLImageElement> {
  const existing = images.get(url);
  if (existing?.complete && existing.naturalWidth > 0) {
    return Promise.resolve(existing);
  }
  return new Promise((resolve, reject) => {
    const img = existing ?? new Image();
    img.decoding = 'async';
    img.onload = () => {
      images.set(url, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error('Failed to adopt image URL'));
    if (!existing || img.src !== url) img.src = url;
    images.set(url, img);
  });
}

export function adoptVideoUrl(
  url: string,
  opts: { loop: boolean; muted: boolean },
): Promise<HTMLVideoElement> {
  const existing = videos.get(url);
  if (existing && existing.readyState >= 2) {
    existing.loop = opts.loop;
    existing.muted = opts.muted;
    return Promise.resolve(existing);
  }
  return new Promise((resolve, reject) => {
    const video = existing ?? document.createElement('video');
    video.playsInline = true;
    video.loop = opts.loop;
    video.muted = opts.muted;
    video.preload = 'auto';

    const onReady = (): void => {
      videos.set(url, video);
      video.play().catch(() => undefined);
      resolve(video);
    };

    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('error', () => reject(new Error('Failed to adopt video URL')), {
      once: true,
    });
    if (video.src !== url) video.src = url;
    videos.set(url, video);
    if (video.readyState >= 2) onReady();
  });
}

export async function ensureVideoPlaying(video: HTMLVideoElement): Promise<void> {
  if (!video.paused) return;
  try {
    await video.play();
  } catch {
    /* wait for user gesture */
  }
}

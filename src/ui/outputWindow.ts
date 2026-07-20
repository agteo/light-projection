/** Open the projector output window, optionally on a secondary display. */
export async function openOutputWindow(): Promise<Window | null> {
  const url = new URL('output.html', window.location.href).href;
  const features = 'popup=yes,width=1280,height=720';

  try {
    const getScreenDetails = (
      window as Window & {
        getScreenDetails?: () => Promise<{ screens: Array<{ left: number; top: number; width: number; height: number; isPrimary: boolean }> }>;
      }
    ).getScreenDetails;

    if (typeof getScreenDetails === 'function') {
      const details = await getScreenDetails();
      const external = details.screens.find((s) => !s.isPrimary) ?? details.screens[0];
      if (external) {
        const placed = window.open(
          url,
          'light-mapper-output',
          `${features},left=${Math.round(external.left + 40)},top=${Math.round(external.top + 40)},width=${Math.min(1280, external.width - 80)},height=${Math.min(720, external.height - 80)}`,
        );
        if (placed) return placed;
      }
    }
  } catch {
    /* permission denied or unsupported — fall through */
  }

  return window.open(url, 'light-mapper-output', features);
}

import type { Project } from '../domain/types';
import { adoptImageUrl, adoptVideoUrl } from './loader';

/** Ensure the output (or any) window has local media elements for project object URLs. */
export async function hydrateProjectMedia(project: Project): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  for (const zone of project.zones) {
    const src = zone.source;
    if (src.kind === 'image' && src.objectUrl && !src.missing) {
      tasks.push(adoptImageUrl(src.objectUrl).catch(() => undefined));
    }
    if (src.kind === 'video' && src.objectUrl && !src.missing) {
      tasks.push(
        adoptVideoUrl(src.objectUrl, { loop: src.loop, muted: src.muted }).catch(() => undefined),
      );
    }
  }
  await Promise.all(tasks);
}

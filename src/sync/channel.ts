import type { Project } from '../domain/types';
import type { RenderMode } from '../render/renderer';

export const SYNC_CHANNEL = 'lazy-mapper-sync-v1';

export type SyncMessage =
  | { type: 'hello'; role: 'output' | 'editor' }
  | {
      type: 'state';
      project: Project;
      mode: RenderMode;
    }
  | { type: 'blackout'; value: boolean };

export function createSyncChannel(): BroadcastChannel {
  return new BroadcastChannel(SYNC_CHANNEL);
}

export function postState(
  channel: BroadcastChannel,
  project: Project,
  mode: RenderMode,
): void {
  const message: SyncMessage = { type: 'state', project, mode };
  channel.postMessage(message);
}

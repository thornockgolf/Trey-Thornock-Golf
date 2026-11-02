/** Pure helpers for the optional video on a drill (the "Show Trey you can do this drill" block). */
import type { ItemVideoDto, PlanSessionDto, VideoDto } from '@ttg/shared';

/** The player's own finished swing videos, newest first: what "Choose from my videos" offers. */
export const choosableVideos = (videos: readonly VideoDto[]): VideoDto[] =>
	videos.filter((v) => v.kind === 'swing' && v.status === 'ready').sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** The same session with one drill's video set or cleared, for an optimistic update before the server answers. */
export const withItemVideo = (s: PlanSessionDto, itemId: string, video: ItemVideoDto | null): PlanSessionDto => ({
	...s,
	items: s.items.map((i) => (i.id === itemId ? { ...i, video } : i))
});

/** One line for a card: what state the attached video is in. */
export const itemVideoLabel = (status: ItemVideoDto['status']): string =>
	status === 'ready' ? 'Ready to watch' : status === 'failed' ? 'Could not be processed. Replace it or remove it.' : 'Getting ready. It will be watchable in a minute or two.';

/** How many drills in a session have a video attached. */
export const videoCount = (s: Pick<PlanSessionDto, 'items'>): number => s.items.filter((i) => i.video).length;

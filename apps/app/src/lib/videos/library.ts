/** Pure helpers for the video library (status chips, labels, polling). */
import type { VideoDto, VideoStatus } from '@ttg/shared';

export type ChipTone = 'success' | 'warning' | 'error' | 'surface';

export interface StatusChip {
	readonly label: string;
	readonly tone: ChipTone;
	/** Shown under the card for states that need explaining. */
	readonly note: string | null;
}

export const FAILED_MESSAGE = "We couldn't process this video. Try re-uploading.";

export const statusChip = (status: VideoStatus): StatusChip => {
	switch (status) {
		case 'ready':
			return { label: 'Ready', tone: 'success', note: null };
		case 'processing':
			return { label: 'Processing', tone: 'warning', note: 'Getting it ready to play. This usually takes a minute or two.' };
		case 'uploaded':
			return { label: 'Uploaded', tone: 'warning', note: 'Waiting to be processed.' };
		case 'failed':
			return { label: 'Failed', tone: 'error', note: FAILED_MESSAGE };
		case 'pending':
			return { label: 'Upload not finished', tone: 'surface', note: null };
	}
};

/**
 * Videos shown in the library. `pending` rows are uploads that never confirmed (cancelled, closed
 * tab); the file is gone from the browser and there is no delete endpoint yet, so they are hidden.
 */
export const libraryVideos = (videos: readonly VideoDto[]) => videos.filter((v) => v.status !== 'pending');

/** Poll while anything is still on its way to `ready` or `failed` (Realtime is not built yet). */
export const shouldPoll = (videos: readonly VideoDto[]) => videos.some((v) => v.status === 'uploaded' || v.status === 'processing');

export const POLL_MS = 4_000;

export const formatDuration = (ms: number | null) => {
	if (ms === null || ms < 0) return null;
	const s = Math.round(ms / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));

export const displayTitle = (v: Pick<VideoDto, 'title' | 'createdAt'>) => v.title?.trim() || `Swing, ${formatDate(v.createdAt)}`;

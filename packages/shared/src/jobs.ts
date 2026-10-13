import { Schema } from 'effect';

/**
 * Background jobs (spec section 4, "Job Queue (pg-boss)"). The app produces, the worker consumes.
 * Payloads are small id references; the worker reads everything else from Postgres and R2.
 */
const Uuid = Schema.String.pipe(Schema.check(Schema.isUUID()));

export const JobPayloads = {
	/** App `/complete` -> worker: transcode, poster, sprite, probe. */
	'video.uploaded': Schema.Struct({ video_id: Uuid }),
	'analysis.segment.uploaded': Schema.Struct({ analysis_id: Uuid, segment_id: Uuid }),
	/** Optional flatten of an analysis for download (Could-Have). */
	'analysis.assemble': Schema.Struct({ analysis_id: Uuid }),
	/** Coach-triggered account deletion: removes the player's files from R2, then their rows (payments are kept, scrubbed). */
	'account.delete': Schema.Struct({ user_id: Uuid }),
	/** Scheduled: deletes replaced segments older than 30 days. */
	'retention.sweep': Schema.Struct({})
} as const;

export type JobName = keyof typeof JobPayloads;
export type JobPayload<N extends JobName> = (typeof JobPayloads)[N]['Type'];
export const JOB_NAMES = Object.keys(JobPayloads) as JobName[];

export interface JobConfig {
	/** Retries after the first attempt before the job is marked failed. */
	retryLimit: number;
	/** Initial retry delay in seconds; doubles each retry (exponential backoff). */
	retryDelaySeconds: number;
	/** A job active longer than this is considered crashed and is retried. */
	expireInSeconds: number;
	/**
	 * `exclusive`: at most one queued-or-active job per entity key, so a repeated `/complete` for the
	 * same video does not queue a second transcode. `standard` has no such limit.
	 */
	policy: 'exclusive' | 'standard';
	/** Cron expression for jobs the worker schedules itself. */
	cron?: string;
}

/** 3 retries with exponential backoff, then `failed` (spec: video.uploaded, segments, assemble). */
const RETRYING: JobConfig = { retryLimit: 3, retryDelaySeconds: 30, expireInSeconds: 60 * 60, policy: 'exclusive' };

export const JOB_CONFIG: Record<JobName, JobConfig> = {
	'video.uploaded': RETRYING,
	'analysis.segment.uploaded': RETRYING,
	'analysis.assemble': { ...RETRYING, expireInSeconds: 30 * 60 },
	'account.delete': { ...RETRYING, expireInSeconds: 30 * 60 },
	'retention.sweep': { retryLimit: 1, retryDelaySeconds: 300, expireInSeconds: 15 * 60, policy: 'standard', cron: '0 3 * * *' }
};

/**
 * The entity key used with the `exclusive` queue policy. Jobs with no natural key (the sweep)
 * return undefined.
 */
export const singletonKey = <N extends JobName>(name: N, payload: JobPayload<N>): string | undefined => {
	const p = payload as Record<string, string>;
	switch (name) {
		case 'video.uploaded':
			return p.video_id;
		case 'analysis.segment.uploaded':
			return p.segment_id;
		case 'analysis.assemble':
			return p.analysis_id;
		case 'account.delete':
			return p.user_id;
		default:
			return undefined;
	}
};

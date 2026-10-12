import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Context, Effect, Layer, Schema } from 'effect';

/** Any failure talking to object storage. The cause is for logs only. */
export class StorageError extends Schema.TaggedError<StorageError>()('StorageError', {
	message: Schema.String,
	/** True when the object does not exist (a 404 on download). */
	notFound: Schema.optional(Schema.Boolean),
	cause: Schema.optional(Schema.Defect())
}) {}

export interface R2Config {
	readonly endpoint: string; // https://<account_id>.r2.cloudflarestorage.com
	readonly accessKeyId: string;
	readonly secretAccessKey: string;
	readonly bucket: string;
}

/** The R2_* variables the worker needs. Returns the config, or the names of the missing variables. */
export const r2ConfigFromEnv = (
	env: Record<string, string | undefined>
): { ok: true; config: R2Config } | { ok: false; missing: string[] } => {
	const names = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const;
	const missing = names.filter((n) => !env[n]);
	if (missing.length > 0) return { ok: false, missing };
	return {
		ok: true,
		config: {
			endpoint: env.R2_ENDPOINT!,
			accessKeyId: env.R2_ACCESS_KEY_ID!,
			secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
			bucket: env.R2_BUCKET!
		}
	};
};

export interface StorageService {
	/** Stream an object to a local file (never buffered whole in memory). */
	readonly download: (key: string, destPath: string) => Effect.Effect<void, StorageError>;
	/** Stream a local file to an object, replacing any object at that key (so a rerun overwrites). */
	readonly upload: (key: string, srcPath: string, contentType: string) => Effect.Effect<void, StorageError>;
	/** Size of the object, or undefined when the key does not exist. */
	readonly head: (key: string) => Effect.Effect<{ readonly sizeBytes: number } | undefined, StorageError>;
}

/**
 * Worker access to the private R2 bucket. Deliberately has no delete: the worker never removes
 * objects (the source upload is kept for later pose estimation).
 */
export class Storage extends Context.Service<Storage, StorageService>()('ttg/worker/Storage') {
	static makeS3Client = (config: R2Config) =>
		new S3Client({
			region: 'auto',
			endpoint: config.endpoint,
			forcePathStyle: true,
			credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
			// Same as the app: no default CRC32 checksums (R2 and presigned browser PUTs don't need them).
			requestChecksumCalculation: 'WHEN_REQUIRED',
			responseChecksumValidation: 'WHEN_REQUIRED'
		});

	static layerFromConfig = (config: R2Config) =>
		Layer.sync(Storage, () => {
			const client = Storage.makeS3Client(config);
			const Bucket = config.bucket;
			return Storage.of({
				download: (key, destPath) =>
					Effect.tryPromise({
						try: async (signal) => {
							const r = await client.send(new GetObjectCommand({ Bucket, Key: key }), { abortSignal: signal });
							if (!r.Body) throw new Error('Empty response body');
							await pipeline(r.Body as Readable, createWriteStream(destPath), { signal });
						},
						catch: (cause) =>
							new StorageError({ message: `Could not download ${key}`, notFound: httpStatus(cause) === 404, cause })
					}),
				upload: (key, srcPath, contentType) =>
					Effect.tryPromise({
						try: async (signal) => {
							const { size } = await stat(srcPath);
							// lib-storage uses one PUT for small files and a multipart upload (10 MB parts) above that.
							const up = new Upload({
								client,
								params: { Bucket, Key: key, Body: createReadStream(srcPath), ContentType: contentType, ContentLength: size },
								partSize: 10 * 1024 * 1024,
								queueSize: 4,
								leavePartsOnError: false
							});
							const abort = () => void up.abort().catch(() => {});
							signal.addEventListener('abort', abort, { once: true });
							try {
								await up.done();
							} finally {
								signal.removeEventListener('abort', abort);
							}
						},
						catch: (cause) => new StorageError({ message: `Could not upload ${key}`, cause })
					}),
				head: (key) =>
					Effect.tryPromise({
						try: async (signal) => {
							try {
								const r = await client.send(new HeadObjectCommand({ Bucket, Key: key }), { abortSignal: signal });
								return { sizeBytes: r.ContentLength ?? 0 };
							} catch (e) {
								if (httpStatus(e) === 404) return undefined;
								throw e;
							}
						},
						catch: (cause) => new StorageError({ message: `Could not read ${key}`, cause })
					})
			});
		});

	/**
	 * In-memory storage for tests. `objects` is the bucket (key -> bytes + content type); `log`
	 * records every call so tests can assert nothing else touched the bucket.
	 */
	static makeMemory = () => {
		const objects = new Map<string, { body: Uint8Array; contentType: string }>();
		const log: { op: 'download' | 'upload'; key: string }[] = [];
		const service = Storage.of({
			download: (key, destPath) =>
				Effect.tryPromise({
					try: async () => {
						log.push({ op: 'download', key });
						const o = objects.get(key);
						if (!o) throw Object.assign(new Error(`NoSuchKey: ${key}`), { $metadata: { httpStatusCode: 404 } });
						await pipeline(Readable.from([o.body]), createWriteStream(destPath));
					},
					catch: (cause) =>
						new StorageError({ message: `Could not download ${key}`, notFound: httpStatus(cause) === 404, cause })
				}),
			upload: (key, srcPath, contentType) =>
				Effect.tryPromise({
					try: async () => {
						log.push({ op: 'upload', key });
						objects.set(key, { body: new Uint8Array(await readFile(srcPath)), contentType });
					},
					catch: (cause) => new StorageError({ message: `Could not upload ${key}`, cause })
				}),
			head: (key) => Effect.sync(() => {
				const o = objects.get(key);
				return o ? { sizeBytes: o.body.length } : undefined;
			})
		});
		return { service, objects, log, layer: Layer.succeed(Storage, service) };
	};
}

const httpStatus = (e: unknown) => (e as { $metadata?: { httpStatusCode?: number } } | undefined)?.$metadata?.httpStatusCode;

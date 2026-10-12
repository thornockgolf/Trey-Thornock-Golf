import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListPartsCommand,
	PutObjectCommand,
	S3Client,
	UploadPartCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PRESIGN_GET_TTL_S, PRESIGN_PUT_TTL_S } from '@ttg/shared';
import { Context, Effect, Layer } from 'effect';
import { StorageError } from './errors';

export interface R2Config {
	readonly endpoint: string; // https://<account_id>.r2.cloudflarestorage.com
	readonly accessKeyId: string;
	readonly secretAccessKey: string;
	readonly bucket: string;
}

export interface PresignedPut {
	readonly method: 'PUT';
	readonly url: string;
	/** The browser must send exactly these headers (they are part of the signature). */
	readonly headers: Readonly<Record<string, string>>;
	readonly expiresAt: Date;
}
export interface PresignedUrl {
	readonly url: string;
	readonly expiresAt: Date;
}
export interface ObjectInfo {
	readonly sizeBytes: number;
	readonly contentType: string | undefined;
}
export interface UploadedPart {
	readonly partNumber: number;
	readonly sizeBytes: number;
	readonly etag: string;
}

/**
 * Cloudflare R2 over its S3 API. The bucket is private: the browser only ever gets short-lived
 * presigned URLs for keys the server chose (see `keys` in @ttg/shared), after an access check.
 * Callers validate inputs (content type, size, part number) with the schemas in @ttg/shared.
 */
export class R2 extends Context.Service<
	R2,
	{
		/** Single-request upload for small files. Signs content type and exact length. */
		readonly presignPut: (input: {
			key: string;
			contentType: string;
			sizeBytes: number;
		}) => Effect.Effect<PresignedPut, StorageError>;
		readonly createMultipart: (input: { key: string; contentType: string }) => Effect.Effect<{ uploadId: string }, StorageError>;
		readonly presignPart: (input: { key: string; uploadId: string; partNumber: number }) => Effect.Effect<PresignedUrl, StorageError>;
		readonly listParts: (input: { key: string; uploadId: string }) => Effect.Effect<readonly UploadedPart[], StorageError>;
		readonly completeMultipart: (input: {
			key: string;
			uploadId: string;
			parts: readonly { partNumber: number; etag: string }[];
		}) => Effect.Effect<void, StorageError>;
		readonly abortMultipart: (input: { key: string; uploadId: string }) => Effect.Effect<void, StorageError>;
		/** Object metadata, or undefined when the key does not exist. Used to verify uploads. */
		readonly head: (key: string) => Effect.Effect<ObjectInfo | undefined, StorageError>;
		/** Short-lived read URL; with `downloadName` the response is an attachment. */
		readonly presignGet: (input: {
			key: string;
			expiresInSeconds?: number;
			downloadName?: string;
		}) => Effect.Effect<PresignedUrl, StorageError>;
	}
>()('ttg/app/R2') {
	static layerFromConfig = (config: R2Config) =>
		Layer.sync(R2, () => {
			const client = new S3Client({
				region: 'auto',
				endpoint: config.endpoint,
				forcePathStyle: true,
				credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
				// The SDK's default CRC32 checksums are added to presigned PUTs and break browser uploads.
				requestChecksumCalculation: 'WHEN_REQUIRED',
				responseChecksumValidation: 'WHEN_REQUIRED'
			});
			const Bucket = config.bucket;
			const fail = (message: string) => (cause: unknown) => new StorageError({ message, cause });
			const expiry = (seconds: number) => new Date(Date.now() + seconds * 1000);

			const presignPut: R2['Service']['presignPut'] = ({ key, contentType, sizeBytes }) =>
				Effect.tryPromise({
					try: async () => ({
						method: 'PUT' as const,
						url: await getSignedUrl(
							client,
							new PutObjectCommand({ Bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes }),
							{
								expiresIn: PRESIGN_PUT_TTL_S,
								// keep Content-Type a header and include it in the signature, so a different type is rejected
								unhoistableHeaders: new Set(['content-type']),
								signableHeaders: new Set(['content-type'])
							}
						),
						headers: { 'Content-Type': contentType },
						expiresAt: expiry(PRESIGN_PUT_TTL_S)
					}),
					catch: fail('Could not presign upload')
				});

			return R2.of({
				presignPut,
				createMultipart: ({ key, contentType }) =>
					Effect.tryPromise({
						try: async () => {
							const r = await client.send(new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType }));
							if (!r.UploadId) throw new Error('No upload id returned');
							return { uploadId: r.UploadId };
						},
						catch: fail('Could not start multipart upload')
					}),
				presignPart: ({ key, uploadId, partNumber }) =>
					Effect.tryPromise({
						try: async () => ({
							url: await getSignedUrl(client, new UploadPartCommand({ Bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), {
								expiresIn: PRESIGN_PUT_TTL_S
							}),
							expiresAt: expiry(PRESIGN_PUT_TTL_S)
						}),
						catch: fail('Could not presign part')
					}),
				listParts: ({ key, uploadId }) =>
					Effect.tryPromise({
						try: async () => {
							const parts: UploadedPart[] = [];
							let marker: string | undefined;
							do {
								const r = await client.send(new ListPartsCommand({ Bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker }));
								for (const p of r.Parts ?? []) {
									parts.push({ partNumber: p.PartNumber ?? 0, sizeBytes: p.Size ?? 0, etag: p.ETag ?? '' });
								}
								marker = r.IsTruncated ? String(r.NextPartNumberMarker) : undefined;
							} while (marker);
							return parts;
						},
						catch: fail('Could not list parts')
					}),
				completeMultipart: ({ key, uploadId, parts }) =>
					Effect.tryPromise({
						try: async () => {
							await client.send(
								new CompleteMultipartUploadCommand({
									Bucket,
									Key: key,
									UploadId: uploadId,
									MultipartUpload: {
										Parts: [...parts]
											.sort((a, b) => a.partNumber - b.partNumber)
											.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag }))
									}
								})
							);
						},
						catch: fail('Could not complete multipart upload')
					}),
				abortMultipart: ({ key, uploadId }) =>
					Effect.tryPromise({
						try: async () => {
							await client.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId }));
						},
						catch: fail('Could not abort multipart upload')
					}),
				head: (key) =>
					Effect.tryPromise({
						try: async () => {
							try {
								const r = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
								return { sizeBytes: r.ContentLength ?? 0, contentType: r.ContentType } satisfies ObjectInfo;
							} catch (e) {
								const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
								if (status === 404) return undefined;
								throw e;
							}
						},
						catch: fail('Could not read object metadata')
					}),
				presignGet: ({ key, expiresInSeconds = PRESIGN_GET_TTL_S, downloadName }) =>
					Effect.tryPromise({
						try: async () => ({
							url: await getSignedUrl(
								client,
								new GetObjectCommand({
									Bucket,
									Key: key,
									ResponseContentDisposition: downloadName ? attachment(downloadName) : undefined
								}),
								{ expiresIn: expiresInSeconds }
							),
							expiresAt: expiry(expiresInSeconds)
						}),
						catch: fail('Could not presign download')
					})
			});
		});
}

/** `attachment; filename="..."` with anything outside a safe set replaced, so it can't break the header. */
export const attachment = (name: string) => {
	const safe = name.replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 120) || 'download';
	return `attachment; filename="${safe}"`;
};

import { Effect, Layer } from 'effect';
import { R2, type ObjectInfo, type UploadedPart } from './r2';
import { StorageError } from './errors';

/**
 * In-memory R2 for handler tests. `objects` is the "bucket"; tests can seed it, and
 * `uploadPart` simulates the browser sending a part to a presigned URL.
 */
export const makeFakeR2 = () => {
	const objects = new Map<string, ObjectInfo>();
	const uploads = new Map<string, { key: string; contentType: string; parts: Map<number, UploadedPart> }>();
	let n = 0;
	const at = (seconds: number) => new Date(Date.now() + seconds * 1000);

	const layer = Layer.succeed(
		R2,
		R2.of({
			presignPut: ({ key, contentType, sizeBytes }) =>
				Effect.succeed({
					method: 'PUT' as const,
					url: `https://r2.test/${key}?op=put&size=${sizeBytes}`,
					headers: { 'Content-Type': contentType },
					expiresAt: at(900)
				}),
			createMultipart: ({ key, contentType }) =>
				Effect.sync(() => {
					const uploadId = `upload-${++n}`;
					uploads.set(uploadId, { key, contentType, parts: new Map() });
					return { uploadId };
				}),
			presignPart: ({ key, uploadId, partNumber }) =>
				Effect.succeed({ url: `https://r2.test/${key}?uploadId=${uploadId}&partNumber=${partNumber}`, expiresAt: at(900) }),
			listParts: ({ uploadId }) =>
				Effect.sync(() => [...(uploads.get(uploadId)?.parts.values() ?? [])].sort((a, b) => a.partNumber - b.partNumber)),
			completeMultipart: ({ key, uploadId, parts }) =>
				Effect.gen(function* () {
					const u = uploads.get(uploadId);
					if (!u || u.key !== key) return yield* new StorageError({ message: 'No such upload' });
					let size = 0;
					for (const p of parts) {
						const have = u.parts.get(p.partNumber);
						if (!have || have.etag !== p.etag) return yield* new StorageError({ message: 'Part mismatch' });
						size += have.sizeBytes;
					}
					objects.set(key, { sizeBytes: size, contentType: u.contentType });
					uploads.delete(uploadId);
				}),
			abortMultipart: ({ uploadId }) => Effect.sync(() => void uploads.delete(uploadId)),
			head: (key) => Effect.sync(() => objects.get(key)),
			presignGet: ({ key, expiresInSeconds = 3600, downloadName }) =>
				Effect.succeed({
					url: `https://r2.test/${key}?op=get${downloadName ? `&download=${encodeURIComponent(downloadName)}` : ''}`,
					expiresAt: at(expiresInSeconds)
				})
		})
	);

	return {
		layer,
		objects,
		uploads,
		uploadPart: (uploadId: string, partNumber: number, sizeBytes: number) => {
			const etag = `"etag-${uploadId}-${partNumber}"`;
			uploads.get(uploadId)!.parts.set(partNumber, { partNumber, sizeBytes, etag });
			return etag;
		}
	};
};

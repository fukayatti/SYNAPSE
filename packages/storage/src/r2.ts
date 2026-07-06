/**
 * Cloudflare R2 バインディング実装 (2026-07-04)
 *
 * Worker では wrangler.jsonc の r2_buckets で bind した R2Bucket が
 * c.env.BUCKET として渡る。署名不要でそのまま read/write できるため、
 * 本番 Worker 経路ではこれを使う。
 */
import type { Storage, PutOptions, StoredObject } from "./types";

// @cloudflare/workers-types が提供する R2Bucket を最小限で参照する。
// (devDependencies に workers-types を持たせ、型のみ利用)
type R2BucketLike = {
	put(
		key: string,
		value: ArrayBuffer | ReadableStream | Uint8Array,
		options?: { httpMetadata?: { contentType?: string; cacheControl?: string } },
	): Promise<unknown>;
	get(key: string): Promise<
		| null
		| {
				body: ReadableStream;
				httpMetadata?: { contentType?: string };
				size?: number;
		  }
	>;
	delete(key: string): Promise<void>;
};

export interface R2StorageConfig {
	bucket: R2BucketLike;
	/** 公開配信のベース URL (例: https://cdn.example.com)。末尾スラッシュ不要。 */
	publicBaseUrl: string;
}

export class R2Storage implements Storage {
	constructor(private readonly config: R2StorageConfig) {}

	async put(
		key: string,
		data: ArrayBuffer | ReadableStream | Uint8Array,
		options?: PutOptions,
	): Promise<void> {
		await this.config.bucket.put(key, data, {
			httpMetadata: {
				contentType: options?.contentType,
				cacheControl: options?.cacheControl,
			},
		});
	}

	async get(key: string): Promise<StoredObject | null> {
		const obj = await this.config.bucket.get(key);
		if (!obj) return null;
		return {
			body: obj.body,
			contentType: obj.httpMetadata?.contentType,
			size: obj.size,
		};
	}

	async delete(key: string): Promise<void> {
		await this.config.bucket.delete(key);
	}

	publicUrl(key: string): string {
		return `${this.config.publicBaseUrl}/${key}`;
	}
}

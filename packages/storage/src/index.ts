/**
 * ストレージ factory (2026-07-04)
 *
 * アプリは createStorage(env) を呼ぶだけで、環境に応じて
 * R2 (Worker バインディングあり) か S3/MinIO (なし) を得る。
 * これにより「本番=R2 / ローカル=MinIO」を呼び出し側の分岐なしで切替える。
 */
import type { Storage } from "./types";
import { R2Storage } from "./r2";
import { S3Storage } from "./s3";

export type { Storage, PutOptions, StoredObject } from "./types";
export { R2Storage } from "./r2";
export { S3Storage } from "./s3";

/** Worker の env に相当する、storage 生成に必要なフィールド。 */
export interface StorageEnv {
	/** R2 バインディング (Worker のみ存在)。あれば最優先で使う。 */
	BUCKET?: unknown;
	/** R2 公開配信ベース URL。 */
	R2_PUBLIC_URL?: string;

	/** 以下は S3/MinIO フォールバック用 (ローカル/Node)。 */
	S3_ENDPOINT?: string;
	S3_BUCKET?: string;
	S3_ACCESS_KEY_ID?: string;
	S3_SECRET_ACCESS_KEY?: string;
	S3_REGION?: string;
	S3_PUBLIC_URL?: string;
}

/**
 * env からストレージ実装を組み立てる。
 * R2 バインディングがあれば R2Storage、なければ S3Storage(MinIO)。
 */
export function createStorage(env: StorageEnv): Storage {
	if (env.BUCKET) {
		return new R2Storage({
			bucket: env.BUCKET as never,
			publicBaseUrl: env.R2_PUBLIC_URL ?? "",
		});
	}

	if (!env.S3_ENDPOINT || !env.S3_BUCKET) {
		throw new Error(
			"[storage] R2 バインディングも S3(MinIO) 設定も無い。BUCKET か S3_ENDPOINT/S3_BUCKET を設定してください。",
		);
	}

	return new S3Storage({
		endpoint: env.S3_ENDPOINT,
		bucket: env.S3_BUCKET,
		accessKeyId: env.S3_ACCESS_KEY_ID ?? "minioadmin",
		secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "minioadmin",
		region: env.S3_REGION,
		publicBaseUrl: env.S3_PUBLIC_URL,
		forcePathStyle: true,
	});
}

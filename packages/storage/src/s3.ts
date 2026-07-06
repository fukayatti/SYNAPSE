/**
 * S3 互換 (MinIO) 実装 (2026-07-04)
 *
 * ローカル開発や Node/Bun 実行時に、R2 の代わりに MinIO を使うための実装。
 * R2 も S3 互換 API を持つため、Worker を介さない経路 (バッチ処理・
 * ローカルサーバ) では本番 R2 にもこのまま接続できる。
 *
 * 依存する @aws-sdk/client-s3 は optional peerDependency。
 * この経路を使うアプリだけがインストールすればよい (Worker バンドルには含めない)。
 */
import type { Storage, PutOptions, StoredObject } from "./types";

export interface S3StorageConfig {
	/** MinIO/R2 のエンドポイント (例: http://localhost:9000)。 */
	endpoint: string;
	region?: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
	/** MinIO は path-style (http://host/bucket/key) が基本。 */
	forcePathStyle?: boolean;
	/** 公開 URL のベース。未指定なら endpoint/bucket を使う。 */
	publicBaseUrl?: string;
}

export class S3Storage implements Storage {
	// 遅延 import した S3Client を保持する (Worker バンドル汚染を避ける)。
	private clientPromise: Promise<unknown> | null = null;

	constructor(private readonly config: S3StorageConfig) {}

	private async client() {
		if (!this.clientPromise) {
			this.clientPromise = import("@aws-sdk/client-s3").then(
				({ S3Client }) =>
					new S3Client({
						endpoint: this.config.endpoint,
						region: this.config.region ?? "us-east-1",
						credentials: {
							accessKeyId: this.config.accessKeyId,
							secretAccessKey: this.config.secretAccessKey,
						},
						forcePathStyle: this.config.forcePathStyle ?? true,
					}),
			);
		}
		return this.clientPromise;
	}

	async put(
		key: string,
		data: ArrayBuffer | ReadableStream | Uint8Array,
		options?: PutOptions,
	): Promise<void> {
		const client = (await this.client()) as import("@aws-sdk/client-s3").S3Client;
		const { PutObjectCommand } = await import("@aws-sdk/client-s3");
		const body =
			data instanceof ArrayBuffer ? new Uint8Array(data) : (data as Uint8Array);
		await client.send(
			new PutObjectCommand({
				Bucket: this.config.bucket,
				Key: key,
				Body: body,
				ContentType: options?.contentType,
				CacheControl: options?.cacheControl,
			}),
		);
	}

	async get(key: string): Promise<StoredObject | null> {
		const client = (await this.client()) as import("@aws-sdk/client-s3").S3Client;
		const { GetObjectCommand, NoSuchKey } = await import("@aws-sdk/client-s3");
		try {
			const res = await client.send(
				new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
			);
			return {
				body: res.Body?.transformToWebStream() as ReadableStream,
				contentType: res.ContentType,
				size: res.ContentLength,
			};
		} catch (err) {
			if (err instanceof NoSuchKey) return null;
			throw err;
		}
	}

	async delete(key: string): Promise<void> {
		const client = (await this.client()) as import("@aws-sdk/client-s3").S3Client;
		const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
		await client.send(
			new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
		);
	}

	publicUrl(key: string): string {
		const base =
			this.config.publicBaseUrl ??
			`${this.config.endpoint.replace(/\/$/, "")}/${this.config.bucket}`;
		return `${base}/${key}`;
	}
}

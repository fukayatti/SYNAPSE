/**
 * ストレージ抽象 (2026-07-04)
 *
 * 意図:
 * - 本番は Cloudflare R2 (Worker の R2 バインディング経由)、
 *   ローカル/Node 実行は S3 互換の MinIO を使う、という二系統を
 *   同一インターフェースで扱えるようにする。
 * - アプリ側 (apps/api) は Storage インターフェースだけに依存し、
 *   実体 (R2 / S3) を意識しない。差し替えは factory (index.ts) で行う。
 * - R2 も MinIO も「S3 互換 API」を持つが、Worker 上では
 *   バインディング経由 (R2Bucket) の方が速く署名不要なので優先する。
 */

/** アップロード時に指定するオブジェクトのメタ情報。 */
export interface PutOptions {
	/** MIME タイプ (例: image/png)。 */
	contentType?: string;
	/** Cache-Control ヘッダ。CDN 配信時の TTL 制御に使う。 */
	cacheControl?: string;
}

/** 取得したオブジェクト。body はストリーム/バイト列いずれかで返る。 */
export interface StoredObject {
	body: ReadableStream | ArrayBuffer;
	contentType?: string;
	size?: number;
}

/**
 * ストレージの共通契約。
 * key はバケット内のオブジェクトキー (例: "uploads/xxx.png")。
 */
export interface Storage {
	/** オブジェクトを保存する。 */
	put(
		key: string,
		data: ArrayBuffer | ReadableStream | Uint8Array,
		options?: PutOptions,
	): Promise<void>;

	/** オブジェクトを取得する。存在しなければ null。 */
	get(key: string): Promise<StoredObject | null>;

	/** オブジェクトを削除する。 */
	delete(key: string): Promise<void>;

	/**
	 * 公開 URL を返す。
	 * - R2: 公開バケットのカスタムドメイン or 署名 URL
	 * - S3/MinIO: エンドポイント + バケット + key
	 */
	publicUrl(key: string): string;
}

// festival.ts: 後方互換のための再エクスポートハブ。
//
// 2026-07-07 のドメイン別分割で、実体は core/menu/order/visitor/lottery/system/
// relations の各ファイルに移動した。`import { ... } from "@fesflow/db"` や
// packages/db/src/index.ts の `import * as festivalSchema from "./schema/festival"`
// を無改修で動かすため、このファイルは export * のみを行うハブとして残す。
// 新しいテーブル/カラムを追加する際は、このファイルではなく該当ドメインの
// ファイルに追記すること。
export * from "./core";
export * from "./menu";
export * from "./order";
export * from "./visitor";
export * from "./lottery";
export * from "./system";
export * from "./relations";

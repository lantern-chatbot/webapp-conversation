# 2026-11-12 セキュリティ更新

[Node.js 2026-11-11のセキュリティリリース](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases)に対応し、Node.jsを24.22.1から24.22.3へ更新しています。`.node-version`、`package.json`の`engines.node`、Dockerfileの2つのベースイメージを同時に更新しました。CIは`.node-version`を参照するため変更していません。

## Node.jsの公式情報との照合

24.x系の対象は次の通りです。いずれも修正版は24.22.3です。

- High 7件: HTTP/2セッション・ストリームの解放後使用、TLSサーバーのハンドシェイク中の未捕捉例外、TLS 1.2再ネゴシエーションによるクライアント証明書認証の回避、HTTPS応答への他接続のヒープ内容の混入など
- Medium 5件: HTTP/2の`altsvc()`・受信データのメモリ上限、プロキシ認証情報のエラーメッセージへの露出、`https.Agent`のTLSセッション再利用による証明書検証の回避、`respondWithFile()`のNULL参照
- Low 3件: Permission Modelの`fs.watch`と`--allow-fs-read`のワイルドカード、zlibの`params()`と`destroy()`の競合
- 同梱依存の更新: llhttp、undici、sqlite

今回のソース確認では、アプリから`node:http2`・`node:tls`・`node:https`のサーバー機能、`fs.watch`、`zlib.params()`を直接呼ぶ経路は見つかっていません。本番のVercelではTLSとHTTP/2の終端はプラットフォーム側で、Next.jsのNodeプロセスがそれらを受けることはありません。Node内蔵の`fetch`（undici）はサーバーからDify APIを呼ぶ経路で使われるため、ランタイムの更新が必要です。

## 依存の更新

- Axios配下のfollow-redirectsを1.16.1から1.16.3へ更新しています。[GHSA-mrwp-f3q8-3g9p](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p)（High）の修正版1.16.2は2026-10-25公開で、前回の更新後に出たものです。ロックファイルの変更はこの1件だけで、Axios本体のバージョンは変えていません。
- 開発用ESLint（typescript-estree）配下のminimatch 10.2.6に[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)（Moderate）が残っていました。上流の宣言範囲では修正版11.0.1に届かないため、`pnpm-workspace.yaml`のoverrideで`minimatch@>=7.0.0 <11.0.1`だけを`^11.0.1`へ置き換えています。minimatch 11はCommonJS向けの出力を持ち、`pnpm lint`で動作を確認しています。アプリの実行時には含まれません。
- 更新後の`pnpm audit`は既知の脆弱性なしです。前回残っていた`braces@3.0.3`の警告は、advisory側の対象範囲の見直しにより検出されなくなっています。

## 本番での適用確認

リポジトリの更新だけでは、デプロイ済み環境への適用は証明できません。

1. Vercelのビルドログで`node --version`が24.22.3以上であることを確認します。Vercelのパッチ版はプラットフォーム側の管理で、`engines.node`の範囲はその下限を示すだけです。
2. Dockerを使う場合は`docker build --pull`で`node:24.22.3-alpine`を取得し直し、検証後に新しいイメージをデプロイします。既存コンテナは自動で置き換わりません。

## 検証

`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:components`、`pnpm build`をNode.js 24.22.3で確認しています。回帰があれば更新コミットをrevertできますが、旧ランタイムの既知脆弱性が戻るため、一時切り戻し後の再修正が必要です。

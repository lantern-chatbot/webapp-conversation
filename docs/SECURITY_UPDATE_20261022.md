# 2026-10-22 セキュリティ更新

開発とCIは `.node-version` の Node.js 24.22.1 を使用します。`package.json` も同系列の修正版以上に制限しています。依存はコミット済みのロックファイルから再現してください。

[Node.js 2026-10-21のセキュリティリリース](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)に対応しています。次回のセキュリティ更新時は、`.node-version` と `engines.node`、Dockerfileの両方のベースイメージを合わせて更新し、既存の検査を実行してください。

## Next.jsの公式情報との照合

Next.jsは16.4.2を採用しています。16.3.8は、2026-10-14公開の以下の公式advisoryの対象範囲に入るため、16.4.1以降への更新が必要です。

- [GHSA-673q-mjm6-r5xr](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr): Cache Componentsの`use cache`関数が複数のtyped arrayを返す場合のRCE。
- [GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw): glibcベースLinuxでのSVG画像処理によるRCE。Next.jsが利用するsharp 0.35.5以上でも回避できます。
- [GHSA-p3m5-59mp-jv5r](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r): App RouterでServer Actionsを利用する場合のDoS。

今回のソース確認では`use cache`・`use server`の宣言やCache Componentsの有効化は見つかりませんでしたが、機能を後から追加しても脆弱な実装を使わないよう、フレームワークを修正版に更新します。監査結果だけでなく、公式advisoryの対象範囲とロック上のバージョンを直接照合してください。

## 公開リポジトリの依存・デプロイ設定

対象は `lantern-chatbot/webapp-conversation` です。別リポジトリ `lantern-inc-jp/lantern-chatbot` の変更だけでは本番へ反映されません。

- Next.jsに加え、Axios配下のfollow-redirectsを1.16.1、開発用jsdom配下のUndiciを8.12.3へ更新しています。Undiciの[2026-10-15公開の修正版](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c)は8.12.2以上です。Node内蔵fetchと開発依存を区別してください。
- uuid、KaTeX、glob、minimatch、js-yaml、Vite等、監査で確認した修正版のある直接・間接依存を更新しています。上流の旧範囲で残るKaTeX・postcss-selector-parser・tinypoolは `pnpm-workspace.yaml` の対象範囲を限定したoverrideで修正版を採用します。
- チャットのMarkdown表示との互換性を維持するためstreamdownは既存系列の1.2.0を固定しています。KaTeXは修正版0.18.7を固定し、破壊的変更を理由に公開元が非推奨にした0.18.11の取り込みを避けます。
- Vercelは `pnpm install --frozen-lockfile` で検証済みの依存を再現します。CIは `.node-version` を参照し、DockerもNode 24.22.1とpnpmに統一しています。
- Dockerビルドでは `.dockerignore` で環境ファイル等を除外し、Difyの秘密鍵は起動時に渡します。最終イメージは一般ユーザーで実行します。

## 本番での適用確認

リポジトリの更新だけでは、デプロイ済み環境への適用は証明できません。

1. Vercel等のビルドログで `node --version`、サーバー実行環境で `process.version` を確認します。バージョン確認のために外部公開APIを追加する必要はありません。
2. 24系で 24.22.1 以上が実際に使われていることを確認します。Vercelのパッチ版はプラットフォーム側の管理です。
3. Dockerを使う場合は `docker build --pull` でベースイメージを取得し直し、検証後に新しいイメージをデプロイします。既存コンテナは自動で置き換わりません。

## 検証と切り戻し

ロックファイルの監査は既知脆弱性とバージョンの照合です。検出件数だけで攻撃成立や侵害を断定しません。修正版のない上流問題を安易なoverrideや監査除外で隠さず、利用条件を調べて記録します。

更新後は型・lint・単体テスト・ビルドと既存のブラウザテストを確認します。回帰があれば更新コミットをrevertできますが、旧ランタイム・旧依存の既知脆弱性が戻るため、一時切り戻し後の再修正が必要です。

## 残る上流の警告

2026-10-22 の全依存監査では、`braces@3.0.3` の High 1件（[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)）が残っています。公式advisoryに修正版はありません。

ロック上の経路はTailwind CSS・ESLint・lint-staged等のglob処理です。今回のソース調査でアプリからbraces/micromatch/fast-globを直接呼ぶ経路は見つかっていません。利用者のチャット本文ではなく、開発・ビルド時のファイルパターンを扱う依存として残っています。未信頼のglob設定を実行しないこと、上流修正版が出たら更新することが必要です。脆弱性を修正済みと扱ったり、auditの除外設定で隠したりはしていません。

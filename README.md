# LANTERN Conversation Web App

LANTERN公式チャットボットのフロントエンドです。Next.jsで実装し、DifyのChatflowをAPI経由で呼び出し、Vercelへデプロイします。

## 構成

```
ユーザー -> Vercel (Next.js) -> Dify Chatflow API -> LLM / Knowledge Base
```

- フロントエンド: 本リポジトリ（Next.js、Vercelにデプロイ）
- 会話ロジック: Dify Chatflow（別リポジトリ／Difyワークスペースで管理）

## セットアップ

`.env.local` を作成し、`.env.example` の内容をコピーして値を設定します。

```
# APP ID: DifyアプリのURL（例: https://cloud.dify.ai/app/xxx/workflow）に含まれる xxx の値
NEXT_PUBLIC_APP_ID=

# Dify APP APIキー: DifyアプリのAPI Accessページで発行。サーバー専用なので NEXT_PUBLIC_ を絶対に付けない
DIFY_API_KEY=

# Dify APIのベースURL。Dify Cloudの場合は https://api.dify.ai/v1
NEXT_PUBLIC_API_URL=
```

Vercelにデプロイする場合は、同じ3つの変数をProject Settings > Environment Variablesにも設定してください。

## アプリ表示のカスタマイズ

`config/index.ts` でタイトルや説明文などを変更できます。

```ts
export const APP_INFO: AppInfo = {
  title: 'LANTERN AI コンシェルジュ',
  description: 'ブランディング・マーケティング・AI活用について、お気軽にご相談ください。',
  copyright: 'LANTERN inc.',
  privacy_policy: 'https://lantern-inc.jp/',
  default_language: 'ja'
}
```

## リッチレスポンス（カード表示）

Difyの回答に次の制御トークンが含まれると、フロントエンドがLANTERN公式サイトへの画像付きカードに変換して表示します。トークン自体は画面には表示されません。

```text
[[LANTERN_CARD:ai-consulting]]
[[LANTERN_CARD:contact]]
[[LANTERN_CARD:services]]
```

利用可能なカードIDは `branding`、`design`、`e-commerce`、`marketing`、`ai-consulting`、`training-dx`、`casestudy`、`company`、`intern`、`contact` です。`services` は6つのサービスカードに展開されます。リンクや画像は `app/components/chat/rich-content/catalog.ts` の許可済みカタログからのみ描画されるため、Dify側でHTMLや画像URLを生成させる必要はありません。

開発環境では [http://localhost:3000/dev/rich-preview](http://localhost:3000/dev/rich-preview) でカードと引用表示を確認できます。このURLは本番環境では404になります。

## 開発

Node.js 24.x / pnpm 12.3.4を使用します。pnpmのバージョンは`package.json`の`packageManager`で固定しています。

```bash
pnpm install
pnpm dev
```

[http://localhost:3000](http://localhost:3000) で確認できます。

## PRの自動検証

GitHub Actionsの`PR validation`をPR作成・更新時、`main`へのpush時、手動実行時に実行します。

| チェック名 | 内容 |
| --- | --- |
| `Lint, types and unit tests` | ESLint、TypeScript、カード制御トークンの単体テスト、通知・選択肢・フォーカスのコンポーネントテスト |
| `Build and browser tests` | 本番ビルドとPlaywrightによるPC・スマートフォン幅のチャット操作テスト |

ローカルでも同じ検証を実行できます。

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:components
pnpm exec playwright install chromium
pnpm test:e2e
```

ブラウザテストは`127.0.0.1:4318`にNext.js、`127.0.0.1:4319`に疑似Difyを起動し、終了時に停止します。両ポートを空けて実行してください。`pnpm test:e2e`自身がビルドも行うため、事前の`pnpm build`は不要です。Vercelと同じ出力設定でビルドし、Docker用のstandalone出力は生成しません。

テスト用のAPP ID・API URL・APIキーはPlaywrightがローカルの値へ固定します。実際のDify APIキー、GitHub Secrets、LLM呼び出しは不要です。ブラウザから外部サイトへの通信も遮断します。

検証対象は質問送信、回答の逐次表示、途中の制御トークン非表示、カードのリンク、会話IDの引き継ぎ、APIエラー表示と再送信、空の質問の送信防止です。ブラウザ→Next.jsのAPI→疑似Difyまでを通します。実Difyの回答品質やVercel Preview上の環境変数・接続はこのテストの対象外です。

失敗時のスクリーンショット・traceとHTMLレポートをActionsの`playwright-report`成果物に7日間保存します。ローカルでは`pnpm exec playwright show-report`で確認できます。

### マージ前の必須チェック

ワークフローの追加だけではマージを禁止できないため、管理者がGitHubのSettings → Rules → Rulesets（またはBranchesの保護ルール）で`main`に次を設定します。

1. PR経由の変更を必須にする
2. `Require status checks to pass`を有効にし、上表の2つのチェック名を追加する（初回実行後に選択可能）
3. マージ前にブランチを最新の`main`へ更新することを必須にする

`pnpm lint`は`--max-warnings 0`で実行し、warningが1件でもあるとCIを失敗させます。コンポーネントテストでは、通知を連続表示したときのタイマー、選択肢更新時の選択保持、入力フォーカスとrefの受け渡しを検証します。型エラーとLintエラーを無視するビルド設定は使用しません。

Dify側だけの変更ではフロントのPRイベントは発生しません。実Difyでの回答評価は、テスト用Difyアプリと評価ケースを準備したうえで、Dify変更時・定期実行の別ワークフローとして追加してください。

## デプロイ（Vercel）

1. Difyでチャットフローを公開し、API AccessでAPIキーを発行、DifyアプリURLからAPP IDを確認する
2. Vercelでこのリポジトリをインポートし、`NEXT_PUBLIC_APP_ID` / `DIFY_API_KEY` / `NEXT_PUBLIC_API_URL` を設定してデプロイ
3. 本番URLで通常回答・サービス一覧カード・問い合わせ導線・引用表示が想定通りか確認する

Difyのチャットフローを変更した場合は、公開・APIキー更新後に上記2〜3を再度行ってください。

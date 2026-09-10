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

```bash
pnpm install
pnpm dev
```

[http://localhost:3000](http://localhost:3000) で確認できます。

## デプロイ（Vercel）

1. Difyでチャットフローを公開し、API AccessでAPIキーを発行、DifyアプリURLからAPP IDを確認する
2. Vercelでこのリポジトリをインポートし、`NEXT_PUBLIC_APP_ID` / `DIFY_API_KEY` / `NEXT_PUBLIC_API_URL` を設定してデプロイ
3. 本番URLで通常回答・サービス一覧カード・問い合わせ導線・引用表示が想定通りか確認する

Difyのチャットフローを変更した場合は、公開・APIキー更新後に上記2〜3を再度行ってください。

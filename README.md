# LANTERN Conversation Web App

LANTERN公式チャットボットのNext.jsフロントエンドです。DifyのChatflowをAPI経由で利用し、Vercelへデプロイします。

## Config App
Create a file named `.env.local` in the current directory and copy the contents from `.env.example`. Setting the following content:
```
# APP ID: This is the unique identifier for your app. You can find it in the app's detail page URL. 
# For example, in the URL `https://cloud.dify.ai/app/xxx/workflow`, the value `xxx` is your APP ID.
NEXT_PUBLIC_APP_ID=

# APP API Key: This is the server-only key used to authenticate API requests.
# You can generate it on the app's "API Access" page. Never prefix it with NEXT_PUBLIC_.
DIFY_API_KEY=

# APP URL: This is the API's base URL. If you're using the Dify cloud service, set it to: https://api.dify.ai/v1.
NEXT_PUBLIC_API_URL=
```

When deploying to Vercel, add the same three variables in Project Settings > Environment Variables. `DIFY_API_KEY` must remain server-only. During migration, the server accepts the legacy `NEXT_PUBLIC_APP_KEY` as a fallback, so the current deployment keeps working. Remove the legacy variable after `DIFY_API_KEY` is configured and the new deployment succeeds.

Config more in `config/index.ts` file:
```js
export const APP_INFO: AppInfo = {
  title: 'LANTERN AI コンシェルジュ',
  description: 'ブランディング・マーケティング・AI活用について、お気軽にご相談ください。',
  copyright: 'LANTERN inc.',
  privacy_policy: 'https://lantern-inc.jp/',
  default_language: 'ja'
}

export const isShowPrompt = false
export const promptTemplate = ''
```

## Rich responses

Difyの回答に次の制御トークンが含まれると、フロントエンドがLANTERN公式サイトへの画像付きカードへ変換します。トークン自体は画面に表示されません。

```text
[[LANTERN_CARD:ai-consulting]]
[[LANTERN_CARD:contact]]
[[LANTERN_CARD:services]]
```

利用可能なカードIDは `branding`、`design`、`e-commerce`、`marketing`、`ai-consulting`、`training-dx`、`casestudy`、`company`、`intern`、`contact` です。`services` は6つのサービスカードへ展開されます。リンクや画像は `app/components/chat/rich-content/catalog.ts` の許可済みカタログから描画されるため、DifyにHTMLや画像URLを生成させる必要はありません。

開発環境では [http://localhost:3000/dev/rich-preview](http://localhost:3000/dev/rich-preview) でカードと引用表示を確認できます。このURLは本番環境では404になります。

## Dify and Vercel deployment order

1. 現在の `NEXT_PUBLIC_APP_ID`、`NEXT_PUBLIC_APP_KEY`、`NEXT_PUBLIC_API_URL` を残したまま、このリポジトリをGitHubへpushしてVercelでフロントエンドを先にデプロイします。旧APIキー変数は移行用フォールバックとしてサーバー側だけで利用されます。
2. 現在利用中のDify APIキーを、Vercelの `DIFY_API_KEY` にサーバー専用変数として追加します。
3. Difyで別途納品される `lantern_chatbot_dify.yml` をDSLとしてインポートします。
4. インポート後のChatflowでLLM、Knowledge Retrievalのナレッジベース、各環境変数を確認して公開します。
5. DifyのAPI Accessで新しいAPIキーを発行し、DifyのアプリURLからApp IDを確認します。
6. Vercelの `NEXT_PUBLIC_APP_ID` と `DIFY_API_KEY` を新しいアプリの値に更新し、`NEXT_PUBLIC_API_URL=https://api.dify.ai/v1` を確認してProductionを再デプロイします。
7. Dify側のPreviewとVercel側の本番URLの両方で、通常回答、サービス一覧、問い合わせ、インターン、引用表示を確認します。

フロントエンドより先に新しいDifyフローへ切り替えると、カード制御トークンが文字として見える可能性があります。必ずフロントエンドを先にデプロイしてください。既存の `NEXT_PUBLIC_APP_KEY` はブラウザに秘密鍵を露出するため、新デプロイの動作確認後にVercelから削除します。

## Getting Started
First, install dependencies:
```bash
npm install
# or
yarn
# or
pnpm install
```

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Using Docker

```
docker build . -t <DOCKER_HUB_REPO>/webapp-conversation:latest
# now you can access it in port 3000
docker run -p 3000:3000 <DOCKER_HUB_REPO>/webapp-conversation:latest
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

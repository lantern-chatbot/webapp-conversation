# 会話ログの保存・分類・集計

## 開発上の契約

対象リポジトリにはIssue/PRテンプレートとAGENTS.mdがないため、同じ組織の[starterの契約](https://github.com/lantern-inc-jp/dify-chatbot-starter/blob/main/AGENTS.md)と[Issue/PRの書き方](https://github.com/lantern-inc-jp/dify-chatbot-starter/blob/main/docs/development/issue-pr-authoring.md)を参考に、1成果1Issue/PR、要求振る舞い・所有層・検出力・独立レビューを記録する。実行コマンドはこのリポジトリのREADMEとCIを正本とし、starter専用コマンドは使わない。

## 順序

| Issue | 成果 | 所有ファイル | 依存 |
| --- | --- | --- | --- |
| #62 | 質問・回答をGAS経由で1往復1行保存 | API route、chat-log utilities、config/server、GAS Core/Code、保存テスト、設定手順 | なし |
| #64 | スプシ上のルールで分類・集計、手修正の保持 | GAS分析処理、分類ルール、集計テスト、設定手順 | #62 |
| #63 | Langfuse等の将来検討 | 今回実装しない | 実運用の件数・負担の確認後 |

GASと設定手順が重なるため、同じ作業レーンで順に進める。#64のPRは#62のブランチをbaseにし、#62のマージ後にmainへ変更する。マージ・本番設定・本番デプロイはこの作業に含めない。

## テスト所有層

| 規則またはリスク | 所有層 | 代表シナリオ | 上位配線・実環境 |
| --- | --- | --- | --- |
| 原文・完了判定 | Unit | UTF-8分割、回答置換、error、中断、サイズ上限 | E2Eで2往復の最終回答 |
| 保存と重複排除 | Unit（GAS Coreとadapter） | 同一ID再送、手入力保持、型付きセル書込 | Google実シートは設定後に確認 |
| 送信先・再試行 | Unit | 認証・環境分離、許可したリダイレクト、最大3回 | E2Eで保存障害でも回答表示 |
| 分類と集計 | Unit（#64） | 優先度・除外・未分類・修正カテゴリ・期間 | GASメニューは設定後に確認 |

Node.js 24.x / pnpm 12.3.4で `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:components`、`pnpm test:e2e`（build含む）を実行する。機能の本体を一時的に無効化し、対応するテストの失敗と復元後の成功を確認する。独立レビューと現在のheadのCIを確認し、実際に未実施のGoogle/Vercel検証をPRに明示する。

## 範囲と運用

別DB・LLMによる分類・過去ログ移行・Dify設定変更は行わない。取得対象はこのWebアプリを通る新規質問。初期状態は無効、PreviewとProductionの送信先・秘密を分離する。共有秘密はサーバー環境変数とGAS Script Propertiesのみ。保存先障害でも回答表示を続けるが、永続キューがないため完全な配信保証はしない。停止は `CHAT_LOG_MODE=off` と再デプロイで行う。

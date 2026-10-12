## メール（/mail）の設定と運用
- クライアント ID

  179446186940-3iqchnpbhvri4npsc1rvtqgkd46fbmu7.apps.googleusercontent.com
  



Maxwell の中で動く本人用の Gmail クライアント（旧 Synedge。2026-10-12 に Maxwell へ統合）。
仕様の基準は Life リポジトリ `Inbox/2026-10-10_Spark風メールクライアント設計.md`。

> **状態**: コードと自動テスト（Vitest 138 件。実 Postgres でのテストを含む）は通っている。
> Google・Firebase・Supabase 本番・Vercel・Android 実機への**実接続はまだ確かめていない**。

### 構成

```text
ブラウザ / Android（Capacitor WebView）
   │  Maxwell のログイン（Supabase）で入る
   ▼
Maxwell（Vercel・Next.js）
   ├ /mail, /mail/settings          画面（src/app/mail, src/mail/components, src/mail/ui）
   ├ /mail/api/*                    画面用 API（src/mail/server → src/mail/core）
   ├ /mail/api/pubsub/gmail         Gmail watch → Pub/Sub push の受け口（OIDC 検証）
   ├ /mail/api/jobs/renew-watches   watch 更新（Vercel Cron 毎日）
   ├ /mail/api/jobs/reconcile       取りこぼし補完・通知再試行（Vercel Cron）
   ├ /api/v1/mail/*                 AI 向け API（MCP のメールツールが使う）
   └ /api/mcp                       MCP（蔵書とメールのツール）
        │
        ├ Gmail REST API（gmail.modify）
        ├ FCM HTTP v1（Android の OS 通知）
        └ Supabase Postgres の mail スキーマ（MAIL_DATABASE_URL で直接接続）
```

| 置き場所 | 中身 |
| --- | --- |
| `src/mail/core` | ドメイン型・検証・エラー分類（クライアント可）、`server/`（Gmail・同期・通知・暗号化）、`testing/`（擬似 Gmail・インメモリDB・契約テスト） |
| `src/mail/database` | Postgres 実装（`mail.*` テーブル）、テスト用マイグレーションランナー |
| `src/mail/ui`・`components`・`client` | 画面。ESLint でサーバー専用コードの import を禁止 |
| `src/mail/server` | 認証（Supabase）・CSRF・レート制限・依存の組み立て・AI 向け整形 |
| `src/mail/worker` | Pub/Sub 受信と定期ジョブの処理本体 |
| `mobile/` | Android アプリ（Capacitor）。本番の `/mail` を WebView で表示する |

### ログインと Gmail の接続

- メール独自のログインは無い。Maxwell にログインしている人が利用者（`mail.users.id = auth.users.id`）
- Gmail は `/mail/settings` の「Gmail をつなぐ」で接続する。Google の同意画面から戻ると、その利用者に紐づけて暗号化保存する
- 接続できる Gmail は `MAIL_ALLOWED_EMAILS` の宛先だけ。別の利用者に接続済みの Gmail は横取りできない
- Android：Google は WebView 内の OAuth を拒むため、接続だけ外部ブラウザで行う
  - WebView（ログイン済み）が `POST /mail/api/auth/google/ticket` で5分有効の署名付きチケットを受け取る
  - 外部ブラウザでチケット付きの `start` を開く
  - 完了すると `synedge://auth?result=connected` でアプリへ戻り、設定画面を開き直す
- 「接続を解除する」は Gmail のトークンを取り消し、保存データ（接続・端末・配信記録）を消す。Gmail のメールと Maxwell のログインはそのまま

### 設定の手順

#### 1. Google Cloud：OAuth・Gmail API

1. Google Cloud プロジェクトを作る（以下 `PROJECT`）
2. API を有効にする：Gmail API、Cloud Pub/Sub API、Firebase Cloud Messaging API
3. OAuth 同意画面
   - ユーザーの種類：個人の Gmail なら「外部」、Workspace なら「内部」にでき、下の7日制限を受けない
   - スコープ：`openid`、`email`、`https://www.googleapis.com/auth/gmail.modify`
   - テストユーザーに自分の Gmail を足す
4. OAuth クライアント ID（ウェブアプリケーション）
   - 承認済みリダイレクト URI：`https://maxwell-bay.vercel.app/mail/api/auth/google/callback`（ローカルは `http://localhost:3000/mail/api/auth/google/callback`）
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` に入れる

`gmail.modify` は一覧・検索・本文・既読/未読・アーカイブ・下書き・送信・watch を1つで満たす最小のスコープ（完全削除は不可）。Google の制限付きスコープに当たる。

公開ステータスが「テスト」かつ「外部」の場合、refresh token は7日で失効する。失効するとアカウントは「再接続が必要」になり通知も止まる。設定画面の「再接続」で戻る。本人だけが使う個人用アプリには検証の例外がある。切り替えるときは Google の最新ドキュメントで条件を確かめる。

#### 2. Supabase（DB）

1. マイグレーションを適用する：`supabase db push`（`supabase/migrations/20261012090000_create_mail_schema.sql` を含む）
2. 接続文字列（Transaction pooler、ポート 6543）を `MAIL_DATABASE_URL` に入れる。`prepare: false` で接続するので pooler で動く
3. `mail` スキーマは全テーブル RLS 有効・ポリシー無し、`anon` / `authenticated` から権限を剥奪済み。公開 API（publishable key）からは読めない。Service Role Key は使わない
4. 保存するもの
   - 利用者（ID とメールアドレス）
   - Gmail 接続（暗号化トークン・スコープ・状態）
   - history cursor、watch の期限とエラー
   - FCM 端末トークン、通知の重複排除キー（メッセージID）
   - 送信の冪等キー、利用者の設定
   - **本文・件名・送信者は保存しない**

#### 3. Vercel の環境変数

`.env.example` の「Mail」の段落を Production（と必要なら Preview）に入れる。

| 変数 | 内容 |
| --- | --- |
| `APP_ORIGIN` | `https://maxwell-bay.vercel.app`（`/mail` は付けない）。OAuth のリダイレクトと Origin 検証に使う |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 手順1のもの |
| `MAIL_ALLOWED_EMAILS` | 接続を許す Gmail（カンマ区切り） |
| `MAIL_OAUTH_SECRET` | 32文字以上の乱数（OAuth の state と Android チケットの署名） |
| `MAIL_TOKEN_ENCRYPTION_KEYS` | `1:<base64 32バイト>`。鍵の入れ替えは `2:…,1:…` のように新しい鍵を先頭に足す |
| `MAIL_DATABASE_URL` | 手順2のもの |
| `GMAIL_PUBSUB_TOPIC` | `projects/<PROJECT>/topics/maxwell-gmail`（手順4） |
| `PUBSUB_SERVICE_ACCOUNTS` | push に使うサービスアカウントのメール（手順4） |
| `PUBSUB_AUDIENCE` | 省略可。既定は `APP_ORIGIN` + `/mail/api/pubsub/gmail` |
| `FCM_SERVICE_ACCOUNT_JSON` | FCM 送信権限のあるサービスアカウント鍵 JSON（base64 可）（手順5） |
| `CRON_SECRET` | 16文字以上の乱数。Vercel Cron が `Authorization: Bearer` で付けてくる |
| `SCHEDULER_AUDIENCE` / `SCHEDULER_SERVICE_ACCOUNTS` | 任意。Cloud Scheduler から OIDC 付きで呼ぶ場合 |

未設定のあいだ `/mail` は「まだ使えません」と出すだけで、蔵書など他の画面は動く。

#### 4. 新着通知の経路（Pub/Sub）

```bash
PROJECT=...
APP=https://maxwell-bay.vercel.app

# Pub/Sub トピック。Gmail のシステムアカウントに発行権限を与える
gcloud pubsub topics create maxwell-gmail
gcloud pubsub topics add-iam-policy-binding maxwell-gmail \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com --role=roles/pubsub.publisher

# push 用のサービスアカウント（OIDC トークンの発行元）
gcloud iam service-accounts create maxwell-pubsub-push

# push サブスクリプション（OIDC トークン付きで Maxwell へ）
gcloud pubsub subscriptions create maxwell-gmail-push --topic maxwell-gmail \
  --push-endpoint=$APP/mail/api/pubsub/gmail \
  --push-auth-service-account=maxwell-pubsub-push@$PROJECT.iam.gserviceaccount.com \
  --push-auth-token-audience=$APP/mail/api/pubsub/gmail \
  --ack-deadline=60 --min-retry-delay=10s --max-retry-delay=600s
```

`PUBSUB_SERVICE_ACCOUNTS=maxwell-pubsub-push@<PROJECT>.iam.gserviceaccount.com` を設定する。
Gmail の watch は Gmail をつないだ直後に始まり、毎日の Cron で更新する（7日で切れるため）。

受け口の応答と Pub/Sub の再送：

| 状況 | 応答 | 結果 |
| --- | --- | --- |
| 同期成功・既処理（重複・古いイベント）・未知のアカウント | 204 | ACK |
| 別の同期が実行中 | 503 | Pub/Sub が再送（取りこぼし防止） |
| Gmail の一時障害・ネットワーク | 503 | Pub/Sub が指数バックオフで再送 |
| OAuth 失効など恒久的な失敗 | 204 | ACK（再接続まで定期照合もとばす） |
| OIDC 不正 | 401 | — |

カーソル（history ID）は処理に成功したあとだけ進める。通知の失敗は配信記録に残り、定期照合で再試行する（最大8回）。30日より古い配信記録は定期照合で消す。

#### 定期ジョブ（Vercel Cron）

`vercel.json` の `crons` で動く。`CRON_SECRET` が必要。

| パス | 既定の頻度 | 役割 |
| --- | --- | --- |
| `/mail/api/jobs/renew-watches` | 毎日 | watch の更新 |
| `/mail/api/jobs/reconcile` | 毎日 | push が届かなかった新着の補完・通知の再試行・古い記録の掃除 |

Vercel の Hobby プランでは Cron は1日1回まで。照合を15分ごとにしたい場合、どちらかを選ぶ。

- Pro プランで `vercel.json` の `schedule` を `*/15 * * * *` にする
- Cloud Scheduler から OIDC 付きの POST で呼び、`SCHEDULER_AUDIENCE`・`SCHEDULER_SERVICE_ACCOUNTS` を設定する

#### 5. Firebase（FCM）と Android アプリ

1. Firebase コンソールで `PROJECT` を Firebase に追加する
2. Android アプリを登録する（パッケージ名 `app.synedge.mail`）
   - `google-services.json` を `mobile/android/app/` に置く（**コミットしない**。`.gitignore` 済み）
3. FCM 送信権限のあるサービスアカウント鍵を `FCM_SERVICE_ACCOUNT_JSON` に入れる
   - Vercel にはメタデータサーバーが無いので、鍵が必要

ビルド（Android Studio か Android SDK と JDK 21 が必要）：

```bash
cd mobile
npm install
SYNEDGE_WEB_URL=https://maxwell-bay.vercel.app/mail npx cap sync android
npx cap open android          # Android Studio で開く
# もしくは
cd android && ./gradlew assembleDebug && adb install -r app/build/outputs/apk/debug/app-debug.apk
```

アプリの動き：

- 本番の `/mail` を WebView で表示する。画面の更新は Web のデプロイだけで反映する。つながらないときは `www/offline.html`
- ログインは WebView 内の Maxwell のログイン画面で行う。Gmail の接続だけ外部ブラウザを使う（上の「ログインと Gmail の接続」）
- 設定の「この端末で通知を受け取る」で権限を求め、FCM トークンを登録する。起動のたびに登録し直す。通知チャンネルは `new_mail`（重要度・高）
- 通知をタップすると、通知データの `threadId` だけを使って `/mail?thread=ID` を開き、本文はサーバーから取り直す

実機での確認（ここが通るまで「新着通知が完成」としない）：

1. アプリを入れて Maxwell にログインし、Gmail をつなぐ
2. 設定で「この端末で通知を受け取る」を押し、通知を許可する
3. 設定で「テスト通知を送る」を押す
4. アプリを閉じて（タスク一覧から消す。強制停止はしない）3 をもう一度行い、OS 通知が出ることを確かめる
5. 別のアカウントから自分の Gmail へメールを送り、アプリを閉じたまま通知が届くこと、タップでそのスレッドが開くことを確かめる

通知が届くまでの時間は保証しない。Gmail の watch の遅れ・Pub/Sub の再送・端末の省電力（Doze）で遅れる。通知権限の拒否、`new_mail` チャンネルのオフ、強制停止のあとは OS が配信を止める。

### AI クライアント（MCP）

Maxwell の `/api/mcp`（蔵書と同じ接続先・同じログイン）に、メールのツールが4つある。

| ツール | 内容 | Gmail への書き込み |
| --- | --- | --- |
| `search_emails` | Gmail の検索演算子で検索。本文なし（最大25件・ページング） | なし |
| `get_thread` | スレッドの本文（テキスト）。`for_summary` で引用を除く | なし |
| `draft_reply` | 返信の宛先・件名・引用元。`body` を渡すと引用付きに整える | なし |
| `save_draft` | 下書きとして保存（本文は最大 50,000 文字） | 下書き作成 |

- **送信のツールは無い**。送信は人がメール画面で確認して行う
- 返す本文には「外部からの信頼できないデータ」という注意書きが付き、MCP の instructions でもメール内の指示に従わないよう伝えている
- 旧 Synedge の個人アクセストークン（`syn_…`）は廃止した。Maxwell のトークン（または claude.ai のコネクタの OAuth）で入る

### ローカル開発とテスト

```bash
npm install
cp .env.example .env.local      # メールを試すなら Mail の段落も埋める
npm run dev                     # http://localhost:3000/mail
npm run test:mail               # Vitest（擬似 Gmail・インメモリDB）
MAIL_DATABASE_URL_TEST=postgres://user:pass@localhost:5432/postgres npm run test:mail   # 実 Postgres でも
MAIL_DATABASE_URL=postgres://... npm run mail:migrate   # テスト用 DB へメールのマイグレーションだけ適用
npm run build && npm run check:mail-bundle               # クライアント JS に秘密情報が入っていないか
```

Gmail API は `src/mail/core/testing/fake-gmail.ts`（Gmail REST の形をまねた fetch）で確かめている。実際の Gmail とはまだつないでいない。

### 料金の注意

- Gmail API：無料（ユーザーごとの割り当てあり）
- Pub/Sub：通知1件は数百バイトで、個人の量なら無料枠に収まる見込み
- FCM：無料
- Vercel：Pub/Sub の受け口と Cron は関数の実行として数える。Hobby では Cron が1日1回まで
- Supabase：既存の Maxwell のプロジェクトを使う（テーブルが増えるだけ）

### 設計判断（安全側の既定値）

- 本文・件名・送信者は DB に保存しない。Gmail を正本とする
- Gmail のトークンは AES-256-GCM で暗号化し、追加認証データにアカウントIDを含める。鍵は DB に置かない
- メール本文の HTML は sanitize したうえで sandbox の iframe に表示する。外部画像は「画像を表示」を押すまで読まない
- 状態を変える要求は自サイトの Origin だけ受け付ける（Bearer トークンの要求は Cookie を使わないので対象外）
- 通知のプレビュー（送信者と件名）は既定でオフ
- MCP からは送信できない

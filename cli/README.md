# maxwell CLI / REST API

グラフをブラウザの外から触るための入口。CLI は REST API の
クライアントであり、特別扱いは一切していない — CLI にできることは
すべて `curl` でもできる。AIエージェント向けの入口は
[`mcp/README.md`](../mcp/README.md)（同じ資格情報・同じAPIを使う）。

## CLI

依存パッケージなし (`cli/maxwell.mjs` と `cli/client.mjs` の2ファイル)。
Node が動く場所に `cli/` をコピーすればそのまま動く。資格情報の保管と
トークン更新は `client.mjs` にあり、MCPサーバーと共有している。

```bash
npm run cli -- help          # リポジトリ内から
npm link && maxwell help     # `maxwell` としてPATHに置く場合
```

### 認証

```bash
maxwell login --url https://maxwell-bay.vercel.app
# Email:    (入力)
# Password: (非表示)
```

アクセストークンとリフレッシュトークンは `~/.maxwell/credentials.json`
(mode 0600) に保存される。ベースURLもここに記憶されるので、以降のコマンド
に `--url` は不要。`MAXWELL_URL` 環境変数で上書きできる。

アクセストークンが期限切れになった場合、CLI はリフレッシュして
**1度だけ**再試行する。2度目の401はリフレッシュトークンも失効している
という意味なので、`maxwell login` をやり直す。

### コマンド

```bash
maxwell whoami                        # トークンが誰のもので、まだ有効か
maxwell workspaces                    # 所属ワークスペース
maxwell stories --workspace <id>      # ストーリー一覧
maxwell story <story-id>              # グラフ全体
maxwell frontier <story-id>           # 今すぐ着手できるタスク
maxwell task add <story-id> --title <t> [--description <d>]
maxwell task status <task-id> DONE
maxwell logout
```

すべてのコマンドに `--json` を付けると機械可読な出力になる。色は端末に
出力するときだけ付き、パイプに流すと消えるので `jq` との併用は安全。

```bash
# 今日やれることを1行ずつ
maxwell frontier "$STORY" --json | jq -r '.[] | "\(.status)\t\(.title)"'
```

## REST API

`/api/v1` 配下。ブラウザからはセッションCookie、それ以外からは
`Authorization: Bearer <access token>` で認証する。どちらでも同じ
user-scoped クライアントになるので、RLS が見えるものを決める。
Service Role Key は使わない（仕様 Section 105）。

### トークンの取得

```
POST /api/v1/auth/token
```

ボディは2種類のどちらか。どちらの資格情報を送ったかが、そのまま
どちらのグラント（発行 / 更新）を意味する。

```jsonc
{ "email": "you@example.com", "password": "…" }   // 発行
{ "refreshToken": "…" }                           // 更新
```

```jsonc
// 200
{ "data": {
    "accessToken": "…", "refreshToken": "…",
    "expiresAt": 1790000000,
    "user": { "id": "…", "email": "you@example.com" } } }
```

- `400` 入力不正
- `401` 資格情報が誤り（「ユーザーが存在しない」と「パスワードが違う」は
  区別せずに返す。未認証の呼び出し元に総当たりの手がかりを与えないため）
- `503` 認証サービスに到達できない。**パスワード誤りとは別物**として返す

### 主なエンドポイント

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | `/api/v1/me` | トークンの持ち主（id とメールアドレス）|
| GET | `/api/v1/workspaces` | 所属ワークスペースと自分のロール |
| GET | `/api/v1/stories?workspaceId=` | ストーリー一覧 |
| POST | `/api/v1/stories` | ストーリー作成 |
| GET | `/api/v1/stories/{id}` | ストーリー1件 |
| GET | `/api/v1/stories/{id}/graph` | ノード・エッジ・統計・フロンティア |
| POST | `/api/v1/stories/{id}/tasks` | タスク追加（`position` 省略可） |
| POST | `/api/v1/stories/{id}/edges` | 依存関係の追加 |
| PATCH | `/api/v1/tasks/{id}` | タスク更新 |
| PATCH | `/api/v1/tasks/{id}/status` | ステータス変更（Status Engine 経由） |
| DELETE | `/api/v1/tasks/{id}` | タスク削除 |
| PATCH | `/api/v1/nodes/{id}/position` | ノード座標の更新 |
| DELETE | `/api/v1/edges/{id}` | 依存関係の削除 |
| GET | `/api/v1/routines?workspaceId=&date=` | ルーチン一覧（`date` はその人の「今日」。省略時は UTC）|
| POST | `/api/v1/routines` | ルーチン作成 |
| PATCH | `/api/v1/routines/{id}` | ルーチン更新（タイトル・曜日・一時停止）|
| DELETE | `/api/v1/routines/{id}` | ルーチン削除（記録ごと消える）|
| PUT | `/api/v1/routines/{id}/completion` | ある日の完了/取り消し（`{ "date", "done" }`）|

成功は `{ "data": … }`、失敗は `{ "error": { "code": …, "message": … } }`。
`code` は `src/lib/errors/codes.ts` の ErrorCode で、HTTP ステータスへの
対応は `src/lib/api/response.ts` が持つ。

```bash
TOKEN=$(curl -s -X POST https://…/api/v1/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"…"}' | jq -r .data.accessToken)

curl -s https://…/api/v1/workspaces -H "Authorization: Bearer $TOKEN" | jq
```

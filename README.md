# Maxwell — DAG Task Manager

DAGベースのタスク管理システム。StoryのStartとGoalを先に定義し、その間をTask NodeとDependency Edgeによって分解する。

使い方のガイドはアプリ自身の `/docs` にある（本文は [`src/content/docs/`](src/content/docs) の Markdown）。このREADMEは動かし方と繋ぎ方、`/docs` は使い方。

## 技術スタック

- Next.js (App Router) / TypeScript
- React / Tailwind CSS
- @xyflow/react (Graph描画)
- Supabase (PostgreSQL / Auth / Realtime)
- Zod (Validation)

## Getting Started

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開く。

## Scripts

```bash
npm run dev       # 開発サーバー起動
npm run build     # プロダクションビルド
npm run lint      # ESLint実行
npm test          # Domain層ユニットテスト (Jest)
npm run test:e2e  # E2Eテスト (Playwright, 要 npx playwright install)
npm run cli       # CLI (`npm run cli -- help`)
npm run mcp       # MCPサーバー (stdio; ホストから起動されるのが普通)
```

## CLI / REST API / MCP

ブラウザ以外からグラフを操作できる。CLI も MCP サーバーも REST API の
クライアントにすぎず、CLI にできることはすべて `curl` でもできる。

```bash
maxwell login --url https://maxwell-bay.vercel.app
maxwell frontier <story-id>          # 今すぐ着手できるタスク
maxwell task status <task-id> DONE
```

`/api/v1` はブラウザからはセッションCookie、それ以外からは
`Authorization: Bearer <access token>` を受け付ける（`POST
/api/v1/auth/token` で発行・更新）。どちらも user-scoped クライアントに
なるため RLS の効き方は同じで、Service Role Key は使わない。

MCPサーバーは同じAPIを12個のツールとして公開する。繋ぎ方は3つ:

```bash
# リモート — クローン不要。URLとトークンだけ
claude mcp add --transport http maxwell https://maxwell-bay.vercel.app/api/mcp \
  --header "Authorization: Bearer $TOKEN"

# ローカル — クローン + maxwell login
claude mcp add maxwell -- node /absolute/path/to/Maxwell/mcp/maxwell-mcp.mjs
```

claude.ai / Claude Desktop の「カスタムコネクタ」からは、上のトークン
すら要らない。URL `https://maxwell-bay.vercel.app/api/mcp` を入れるだけで、
OAuth 2.1 (Dynamic Client Registration → ブラウザでログイン/確認 →
トークン取得) を Maxwell 自身が認可サーバーとして受け持つ。詳しくは
[`mcp/README.md`](mcp/README.md)。

同じ12ツール・同じディスパッチで、違うのは「APIへの到達手段」だけ。
サインインはツールにしていない — パスワードはツール引数ではない。

エンドポイント一覧とCLIの全コマンドは [`cli/README.md`](cli/README.md)、
MCPのツール一覧は [`mcp/README.md`](mcp/README.md)。

## CSV インポート（ベータ）

**サイドバーの「Beta → Unfinished features」をオンにすると**、グラフのツールバー（左下、「+」の隣）にインポートが出る。オフの間はボタン自体が存在しない。

トグルは localStorage に持つ（Motion の設定と同じ）。1人・1ブラウザの答えで、サーバーへの往復を待たずに効き、気が変わっても代償がない。別のマシンには付いてこないが、「未完成のものを見せろ」という設定はそちら側に倒すのが正しい — ベータは、驚かされてもいい人が、驚かされてもいい場所で入れるもの。

```csv
title,depends_on
Design the schema,
Build the API,Design the schema
Build the UI,Design the schema
Ship it,Build the API;Build the UI
```

`title` だけが必須。`depends_on` は**同じファイル内の行**か、**そのストーリーに既にあるタスク**をタイトルで指す（1セルに複数書くときは `;` 区切り）。他に `key`（タイトルが重複するとき）、`description`、`due_date`（YYYY-MM-DD）、`priority`（1–4）を読む。最大500行。

タイトルの一覧だけではグラフにならないので、依存を書ける形にしてある。何も待たない行は START から、誰にも待たれない行は GOAL へ自動で繋がる（ストーリー作成時の START→GOAL 直結は、その両方が引かれたときに外れる）。

書き込む前に全部検証し、**問題は行番号付きでまとめて出す**。書き込みは1トランザクション（`dag.import_tasks`）なので、途中で失敗しても半分だけ入ることはない。ステータスは全部 READY で入れたあと Status Engine が導出し直す — 何がブロックされているかの答えはSQL側には置かない。

## PWA と通知

ホーム画面に入れられる。入れると、閉じていても手が空いたタスクを知らせに来る。
使い方はアプリの [`/docs`](src/content/docs/10-notifications.md) にあり、ここには
動かすために要るものだけ書く。

- `src/app/manifest.ts` — マニフェスト（`/manifest.webmanifest`）
- `public/sw.js` — Service Worker。push / notificationclick と、オフライン時の
  フォールバック1枚だけ。ページのキャッシュはしない（他人が動かしたグラフの
  古い絵より、「オフライン」と言う方がまし）
- `public/icons/` — `node scripts/icons.mjs` が生成する。手で置いたバイナリでは
  ないので、色や形を変えたければスクリプトを直す
- `dag.push_subscriptions` — 端末1台=1行。RLS で本人しか読めない

通知は「自分の操作の結果を自分の端末に」送る。CLI や MCP のエージェントが
DONE にしたときも、動いているのはそのユーザーのトークンなので同じ経路で届く。
他人の端末に送るには本人以外がその行を読む必要があり、それは Service Role Key
でも RLS の緩和でもなく「誰に何を送ってよいか」を決める関数を足す話になるので、
やっていない。

### 環境変数（任意）

```bash
npx web-push generate-vapid-keys
```

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=https://github.com/Ubik0914/Maxwell   # 省略可
```

設定しなければ通知だけが無効になり、他は今までどおり動く（設定画面の
スイッチが「Unavailable」と出る）。**鍵は永久に同じもの**を使うこと —
購読は公開鍵に対して作られるので、差し替えると既存の端末が黙る。

## Deployment (Vercel)

GitHub リポジトリ `Ubik0914/Maxwell` は Vercel プロジェクト `maxwell`
(team: `pamois-projects`) に連携済みで、`main` ブランチへの push が
自動的に Production デプロイをトリガーする。Pull Request は Preview
デプロイを生成する。

### 環境変数（要手動設定）

Vercel の Project Settings → Environment Variables で以下を設定する
（Production / Preview 両方）。MCP経由のツールでは環境変数を設定できな
かったため、これは手動設定が必要:

```
NEXT_PUBLIC_SUPABASE_URL=https://zdzbcfkhqkvbgrqzzshc.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_d58qpmAWFzKePtYi-5Ga8Q_qq1jasLs
```

通知を使うなら、上の VAPID 3つも同じ画面で設定する。

Service Role Key はクライアントに公開してはならないため使用しない
（仕様 Section 105 準拠）。

### Health Check

デプロイ確認用に `GET /api/health` が `{"status":"ok"}` を返す。

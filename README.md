# Maxwell — DAG Task Manager

DAGベースのタスク管理システム。StoryのStartとGoalを先に定義し、その間をTask NodeとDependency Edgeによって分解する。

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

Service Role Key はクライアントに公開してはならないため使用しない
（仕様 Section 105 準拠）。

### Health Check

デプロイ確認用に `GET /api/health` が `{"status":"ok"}` を返す。

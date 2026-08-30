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

MCPサーバーは同じAPIを12個のツールとして公開する。繋ぎ方は2つ:

```bash
# リモート — クローン不要。URLとトークンだけ
claude mcp add --transport http maxwell https://maxwell-bay.vercel.app/api/mcp \
  --header "Authorization: Bearer $TOKEN"

# ローカル — クローン + maxwell login
claude mcp add maxwell -- node /absolute/path/to/Maxwell/mcp/maxwell-mcp.mjs
```

同じ12ツール・同じディスパッチで、違うのは「APIへの到達手段」だけ。
サインインはツールにしていない — パスワードはツール引数ではない。

エンドポイント一覧とCLIの全コマンドは [`cli/README.md`](cli/README.md)、
MCPのツール一覧は [`mcp/README.md`](mcp/README.md)。

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

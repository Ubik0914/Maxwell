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
```

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

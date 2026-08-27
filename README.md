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
npm run dev     # 開発サーバー起動
npm run build   # プロダクションビルド
npm run lint    # ESLint実行
```

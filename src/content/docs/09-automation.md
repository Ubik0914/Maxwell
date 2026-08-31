# CLI・API・MCP

ブラウザの外からも同じグラフを触れる。CLI も MCP サーバーも REST API のクライアントにすぎず、CLI にできることはすべて `curl` でもできる。

## REST API

`/api/v1` が入口。ブラウザからはセッション Cookie、それ以外からは `Authorization: Bearer <access token>` を受け付ける（トークンは `POST /api/v1/auth/token` で発行・更新）。

どちらの経路でもユーザーの権限で動くクライアントになるので、RLS の効き方は同じ。Service Role Key は使わない。

## CLI

```bash
maxwell login --url https://maxwell-bay.vercel.app
maxwell frontier <story-id>          # 今すぐ着手できるタスク
maxwell task status <task-id> DONE
```

コマンドの一覧とエンドポイントの一覧はリポジトリの `cli/README.md` にある。

## MCP

同じ API を12個のツールとして公開している。繋ぎ方は3通り。

```bash
# リモート — クローン不要。URL とトークンだけ
claude mcp add --transport http maxwell https://maxwell-bay.vercel.app/api/mcp \
  --header "Authorization: Bearer $TOKEN"

# ローカル — クローン + maxwell login
claude mcp add maxwell -- node /absolute/path/to/Maxwell/mcp/maxwell-mcp.mjs
```

claude.ai / Claude Desktop の「カスタムコネクタ」からは、上のトークンすら要らない。URL `https://maxwell-bay.vercel.app/api/mcp` を入れるだけで、OAuth 2.1（動的クライアント登録 → ブラウザでログイン・確認 → トークン取得）を Maxwell 自身が認可サーバーとして受け持つ。

ツールの一覧は `mcp/README.md` にある。

サインインはツールになっていない。パスワードはツールの引数ではないため。

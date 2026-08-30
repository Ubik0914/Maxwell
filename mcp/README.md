# maxwell-mcp — MCPサーバー

Maxwellのグラフを、AIエージェントが呼べる12個のツールとして公開する
MCP (Model Context Protocol) サーバー。**繋ぎ方は2つある。**

| | 何が要るか | 誰向けか |
| --- | --- | --- |
| **リモート (HTTP)** | URLとトークンだけ | クローンできない/したくない人、チーム |
| **ローカル (stdio)** | リポジトリのクローン + `maxwell login` | 手元で開発している人 |

どちらも同じ12ツール・同じディスパッチで、違いは「APIへの到達手段」
だけ。ツール定義は1箇所にしかなく、経路によって挙動が変わることは
仕組み上ありえない。

CLIと同じく `/api/v1` のクライアントにすぎない。グラフへの second code
path は存在せず、同じエンドポイント・同じトークン・同じRLSを通る。
つまりモデルが触れるのはそのトークンの持ち主が触れる行だけで、
それがエージェントに渡してよい理由そのもの。

## リモート (HTTP) — クローン不要

デプロイ済みのMaxwellが `/api/mcp` でMCPを話す。必要なのはURLと
アクセストークンだけ。

```bash
TOKEN=$(curl -s -X POST https://maxwell-bay.vercel.app/api/v1/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"…"}' | jq -r .data.accessToken)

claude mcp add --transport http maxwell \
  https://maxwell-bay.vercel.app/api/mcp \
  --header "Authorization: Bearer $TOKEN"
```

ステートレス。セッションIDは発行せず、リクエストごとにトークンを見る。
サーバー側は資格情報を一切持たず、呼び出し元のものを転送するだけ。
Authorization が無いリクエストは、誰かとして動く代わりに401を返す。

アクセストークンは短命なので、期限が切れたら取り直す。長期運用には
リフレッシュの自動化が要る（`POST /api/v1/auth/token` に
`{"refreshToken":"…"}`）。

### claude.ai / Claude Desktop のカスタムコネクタから

あちらは OAuth 2.1 必須（接続時に必ず Dynamic Client Registration を
試み、無ければ失敗する）なので、Maxwell自身が小さな認可サーバーに
なっている。「カスタムコネクタを追加」に名前とこのURLを入れるだけでよい：

```
https://maxwell-bay.vercel.app/api/mcp
```

流れは `続ける` → Claude が `/.well-known/oauth-protected-resource` →
`/.well-known/oauth-authorization-server` の順に辿り着き、
`/oauth/register` で自分をクライアント登録し、ブラウザで
`/oauth/authorize` を開く。そこでMaxwellのメールアドレスとパスワードで
ログイン（すでにブラウザにセッションがあれば、ログインの代わりに
「Allow / Deny」の確認画面）すると、`/oauth/token` を経て
Claude 側にアクセストークンが渡る。

新しく増えたのは認可コードを仲介する部分だけで、その先にある
「アクセストークン」は実体としては普通の Supabase セッションの
access_token/refresh_token そのもの。`/api/mcp` にとっては
`claude mcp add --header "Authorization: Bearer …"` で渡すトークンと
区別がつかない — 発行経路が増えただけで、検証は1つのままになる
（`requireApiUser` / RLS）。

Dynamic Client Registration は誰でも呼べる（サインアップと同じ）ので、
登録されるクライアントは client_secret を持たない public client
（`token_endpoint_auth_method: "none"`）のみ。認可はPKCE (S256必須) と
`/oauth/authorize` の確認画面（どの名前のクライアントがどの
redirect_uri に戻ろうとしているか）が担う。詳細は
`supabase/migrations/20260830100000_create_dag_oauth_tables.sql` と
`src/app/oauth/`。

## ローカル (stdio) — セットアップ

まずCLIでログインする。**サインインはツールにしていない** —
パスワードがツール引数として会話ログに残るべきではないし、モデルが
持つべきものでもない。ログインは端末で一度だけ行い、MCPサーバーは
それが残した `~/.maxwell/credentials.json` を読む。

```bash
npm run cli -- login --url https://maxwell-bay.vercel.app
```

### Claude Code

```bash
claude mcp add maxwell -- node /absolute/path/to/Maxwell/mcp/maxwell-mcp.mjs
```

### Claude Desktop / Cursor など (JSON設定)

```jsonc
{
  "mcpServers": {
    "maxwell": {
      "command": "node",
      "args": ["/absolute/path/to/Maxwell/mcp/maxwell-mcp.mjs"],
      // 省略時は login 時のURL。ローカルビルドに向けたいときだけ。
      "env": { "MAXWELL_URL": "http://localhost:3000" }
    }
  }
}
```

`npm link` してあれば `command` は `maxwell-mcp` だけでよい。

## ツール

| ツール | 内容 |
| --- | --- |
| `whoami` | どのアカウントとして動いているか、トークンがまだ有効か |
| `list_workspaces` | 所属ワークスペースと自分のロール |
| `list_stories` | ワークスペース内のストーリー一覧 |
| `get_story` | ノード・エッジ・統計・フロンティア（**最初に呼ぶべき1本**） |
| `get_frontier` | 今すぐ着手できるタスク |
| `create_story` | ストーリー作成（START/GOAL付き） |
| `create_task` | タスク追加。`dependsOn` / `blocks` で同時に結線できる |
| `update_task` | タイトル・説明・優先度・期日 |
| `set_task_status` | READY / IN_PROGRESS / DONE / CANCELLED |
| `delete_task` | タスクと、そこを通る全エッジを削除 |
| `connect_tasks` | 依存関係を張る（循環は拒否される） |
| `disconnect_tasks` | 依存関係を1本外す |

読むだけのツールには `readOnlyHint`、消すツールには `destructiveHint`
が付いている。ホストはこれを見て確認ダイアログを出す/出さないを決める
ので、ここを間違えると「誰も見ていない確認」でエージェントが削除する。

### BLOCKED は設定できない

`set_task_status` の enum に `BLOCKED` は無い。未完了のタスクが前に
あるタスクは自動的に BLOCKED になり、最後の前提が DONE になった瞬間に
自動で READY に戻る。BLOCKED はグラフが導出する状態であって、
クライアントが宣言する状態ではない（Status Engine / Phase 14）。

`set_task_status` の応答には `affectedTasks` が入る。あるタスクを DONE
にしたときに何が READY になったかが、そのまま返ってくる。

### グラフの組み立て方

エージェントには `create_task` を1タスクずつ呼ばせるのが素直。
`dependsOn` に前提ノードのid、`blocks` に後続ノードのidを渡せば、
作成と結線が1回で済む。ストーリーの終端になるタスクには GOAL のidを
`blocks` に入れる。

タスクは作成された時点で存在するので、結線だけが失敗した場合は
`refused` として結果に載る（呼び出し全体をエラーにすると、モデルが
タスクをもう一度作りかねない）。

座標は省略できる。省略すると START の1列右・既存ノードの下に置かれ、
アプリの自動整列が後で正しい位置に並べ直す。

## プロトコル

JSON-RPC 2.0。stdioでは1メッセージ1行、HTTPでは Streamable HTTP
（POSTにJSON-RPCを1本、通知は202、`GET`/`DELETE` は405 — こちらから
送るメッセージもセッションも無いので）。

stdioでは **stdoutにプロトコル以外を書いてはいけない** — `console.log`
1つがプロトコルエラーになるので、診断出力はすべてstderrへ。

対応バージョンは `2025-06-18` / `2025-03-26` / `2024-11-05`。クライアント
が知らないバージョンを要求してきたら、こちらの最新を返して判断を委ねる。

SDKは意図的に依存に入れていない。実装が要るのは `initialize` /
`tools/list` / `tools/call` の3つだけ。直接書けば `mcp/` と `cli/` が
同じ種類のもの — 素のNode、インストール不要、lockfileと同期を取る必要
なし — のままでいられて、`src/app/api/mcp/route.ts` はその `handle()`
をそのまま呼ぶだけで済む。

ツールは「APIへの到達手段」を引数で受け取る（クロージャで掴まない）。
stdioではトークンをファイルから読むCLIのクライアントが、HTTPでは
呼び出し元のBearerを転送するfetchが渡る。カタログは1つ。

手で叩いて確かめるなら:

```bash
# stdio
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | npm run --silent mcp

# HTTP
curl -s -X POST https://maxwell-bay.vercel.app/api/mcp \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
```

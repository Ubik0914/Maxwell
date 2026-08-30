# maxwell-mcp — MCPサーバー

Maxwellのグラフを、AIエージェントが呼べる12個のツールとして公開する
MCP (Model Context Protocol) サーバー。Claude Code / Claude Desktop /
Cursor など、MCPを話すホストならどれでも繋がる。

CLIと同じく `/api/v1` のクライアントにすぎない。グラフへの second code
path は存在せず、同じエンドポイント・同じトークン・同じRLSを通る。
つまりモデルが触れるのは `maxwell login` した本人が触れる行だけで、
それがエージェントに渡してよい理由そのもの。

## セットアップ

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

stdio上のJSON-RPC 2.0、1メッセージ1行。**stdoutにはプロトコル以外を
書いてはいけない** — `console.log` 1つがプロトコルエラーになるので、
診断出力はすべてstderrへ。

対応バージョンは `2025-06-18` / `2025-03-26` / `2024-11-05`。クライアント
が知らないバージョンを要求してきたら、こちらの最新を返して判断を委ねる。

SDKは意図的に依存に入れていない。stdioトランスポートは改行区切りの
JSON-RPCで、実装が要るのは `initialize` / `tools/list` / `tools/call`
の3つだけ。直接書けば `mcp/` と `cli/` が同じ種類のもの — 素のNode、
インストール不要、lockfileと同期を取る必要なし — のままでいられる。

手で叩いて確かめるなら:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | npm run --silent mcp
```

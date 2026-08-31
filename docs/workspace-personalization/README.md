# Workspace Personalization — データ要件

MCP実行時にAIへ渡す参考情報を、次の構成で持つ。

```
MCP実行時の参考情報
=
既存テンプレート項目（Radio / Checkbox）
+
自由文（Free Text）
```

よく使う指示は選択式に構造化し、選択肢で表現しきれない内容だけを自由文に残す。
対象は「AIの振る舞いのパーソナライズ」のみで、権限・ツール実行可否・認証・接続設定は含めない。

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `template-definition.yaml` | Template Definition。選択肢・説明・デフォルトを持つマスターデータ。全Workspace共通で1本。 |
| `workspace-value.example.yaml` | Workspace Value。各Workspaceが実際に保存する値。Workspaceごとに1本。 |

分離の理由は、選択肢の追加・文言変更をWorkspaceの保存値に波及させないため。
Workspace Value は「キーと値」だけを持ち、AIへの指示文（`description`）は Template Definition 側でのみ管理する。

## 1. 設計した設定項目の一覧

### Radio（単一選択・3択）

| key | 項目 | 選択肢 | Default |
| --- | --- | --- | --- |
| `response_depth` | 回答の詳しさ | `concise` 簡潔 / `balanced` 標準 / `detailed` 詳細 | `balanced` |
| `explanation_style` | 説明スタイル | `conclusion_first` 結論先出し / `step_by_step` 手順型 / `context_first` 背景重視 | `conclusion_first` |
| `thinking_depth` | 思考の深さ | `quick` 即答 / `standard` 標準 / `deep` 熟考 | `standard` |
| `decision_criteria` | 判断時の優先基準 | `speed` 速度優先 / `balanced` バランス / `quality` 品質優先 | `balanced` |
| `ambiguity_policy` | 曖昧な要求への対応 | `ask_first` 確認する / `assume_and_proceed` 前提を置いて進める / `present_options` 複数案を出す | `assume_and_proceed` |
| `improvement_suggestion` | 改善提案の積極性 | `on_request` 求められたときのみ / `when_significant` 重要なときだけ / `proactive` 積極的に | `when_significant` |
| `requirement_stance` | 与えられた要件への姿勢 | `follow_as_is` そのまま実行 / `verify_then_follow` 検証してから実行 / `challenge` 目的から問い直す | `verify_then_follow` |
| `task_granularity` | タスク粒度 | `coarse` 粗い / `medium` 標準 / `fine` 細かい | `medium` |
| `task_naming` | タスク名の付け方 | `verb_object` 動詞+目的語 / `deliverable` 成果物名 / `outcome` 完了状態 | `verb_object` |
| `priority_policy` | Priorityの付け方 | `critical_path` クリティカルパス基準 / `quick_win` 早く終わる順 / `manual_only` 指定時のみ | `critical_path` |

Priority は「値そのもの」ではなく「付与基準」を設定にした。数値の割り当ては都度AIが判断し、`nodes.priority` に対応させる（小さいほど高優先）。

### Checkbox（複数選択可）

| key | 項目 | option_key（Default: ✓ = true） |
| --- | --- | --- |
| `output_format` | 出力形式 | `bullet_points` 箇条書き ✓ / `comparison_table` 比較表 / `diagram` 図解(Mermaid) / `code_example` コード例 ✓ |
| `answer_supplements` | 回答に添える補足 | `assumptions` 前提条件 ✓ / `concrete_examples` 具体例 ✓ / `tradeoffs` トレードオフ / `risks` リスク ✓ / `next_actions` Next Action ✓ |
| `task_breakdown` | タスク整理時に明示する項目 | `dependencies` 依存関係 ✓ / `blockers` ブロッカー ✓ / `goal_alignment` Goalとの関係 ✓ / `subtasks` Subtask / `parallelizable` 並行可能なタスク / `definition_of_done` 完了条件 ✓ |

Default は「毎回出しても邪魔にならないもの」だけを `true` にした。
`comparison_table` `diagram` `tradeoffs` `subtasks` `parallelizable` は、必要な場面が限られるため既定はオフ。

### Free Text

| key | 項目 | 上限 |
| --- | --- | --- |
| `workspace_context` | Workspaceの前提知識（ドメイン、用語、技術スタック、体制、制約） | 2000字 |
| `custom_instructions` | テンプレートで表現できない追加指示（禁止事項、言い回し、命名規則） | 2000字 |

自由文を2つに分けたのは、性質が違うため。`workspace_context` は「AIが知らないと誤る事実」、`custom_instructions` は「AIへの命令」。両方を1枠に混ぜると、事実と指示の区別がつかず参照精度が落ちる。

### 意図的に分割しなかったもの

| まとめた先 | 含めた観点 | 理由 |
| --- | --- | --- |
| `output_format` | 箇条書き / 比較表 / Diagram / Code Example | すべて「どの表現手段を使うか」で、併用可能な同種の指示。 |
| `answer_supplements` | 前提条件 / 具体例 / トレードオフ / リスク / Next Action | すべて「結論に何を添えるか」。項目ごとに独立設定にすると設定数だけ増える。 |
| `task_breakdown` | 依存関係 / ブロッカー / Goalとの関係 / Subtask / 並行可能 / 完了条件 | すべて「タスクを提示するとき何を明示するか」。 |
| `decision_criteria` | 速度・品質のトレードオフ判断 | `thinking_depth`（考える量）とは別軸だが、「品質重視/速度重視」を複数キーに分けると設定が矛盾しうるため1本にした。 |

合計 15 キー（Radio 10 / Checkbox 3 / Free Text 2）。

## 値の解決ルール

MCPが Workspace Value を読むときの扱い。

| ケース | 扱い |
| --- | --- |
| キーが存在しない | Template Definition の `default` を適用する |
| radio の値が `options` に無い | `default` を適用する（不正値は無視） |
| checkbox に未知の `option_key` が含まれる | その要素だけ無視する |
| checkbox が空配列 `[]` | 「すべて未選択」として扱う（default は適用しない） |
| textarea が空文字 | 指示なしとして扱い、参考情報に含めない |
| `template_version` が古い | 既存キーはそのまま使い、新規キーは `default` で補完する |

Workspace Value 側には表示名も説明文も持たせない。AIに渡す指示文は、選択された `value` / `option_key` を Template Definition の `description` に引き当てて組み立てる。これにより文言の改訂が保存値のマイグレーションを伴わない。

## 参考情報としての受け渡し

MCPは Workspace Value をそのまま取得し、`values` 配下のキーと値を参考コンテキストとして渡せる構造にしている（ネストは `values` の1段のみ、値はスカラー・文字列配列・文字列だけ）。
自由文は選択式の指示と競合しうるため、競合時は自由文（`custom_instructions`）を優先する、という優先順位で扱う。

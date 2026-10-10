import type { ThreadDetail, ThreadSummary } from "@synedge/mail-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ComposeForm, SendConfirmDialog, type ComposeValue } from "./compose";
import { MailLayout } from "./layout";
import { Banner, Toggle } from "./primitives";
import { ThreadList } from "./thread-list";
import { HtmlBody, TextBody, ThreadView } from "./thread-view";

const thread = (over: Partial<ThreadSummary> = {}): ThreadSummary => ({
  id: "t1",
  subject: "会議の件",
  snippet: "明日の会議について",
  participants: [{ name: "山田", email: "y@example.com" }],
  lastMessageAt: new Date().toISOString(),
  unread: true,
  hasAttachments: true,
  messageCount: 2,
  ...over,
});

const listProps = {
  selectedId: null,
  onSelect: () => {},
  loading: false,
  error: null,
  onRetry: () => {},
  hasMore: false,
  loadingMore: false,
  onLoadMore: () => {},
  emptyTitle: "受信トレイは空です",
  label: "受信トレイ",
};

describe("ThreadList", () => {
  it("送信者・件名・プレビュー・未読・添付を表示し、選択できる", () => {
    const onSelect = vi.fn();
    render(<ThreadList {...listProps} threads={[thread(), thread({ id: "t2", unread: false, hasAttachments: false, subject: "", participants: [{ email: "b@example.com" }], snippet: "x" })]} onSelect={onSelect} />);
    expect(screen.getByText("山田")).toBeInTheDocument();
    expect(screen.getByText("会議の件")).toBeInTheDocument();
    expect(screen.getByText("明日の会議について")).toBeInTheDocument();
    expect(screen.getAllByLabelText("未読")).toHaveLength(1);
    expect(screen.getAllByLabelText("添付あり")).toHaveLength(1);
    expect(screen.getByText("(件名なし)")).toBeInTheDocument();
    fireEvent.click(screen.getByText("会議の件"));
    expect(onSelect).toHaveBeenCalledWith("t1");
  });

  it("ローディング・エラー・空状態を区別する", () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ThreadList {...listProps} threads={[]} loading />);
    expect(screen.getByRole("status", { name: "読み込み中" })).toBeInTheDocument();
    rerender(<ThreadList {...listProps} threads={[]} error="ネットワークに接続できません" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("ネットワーク");
    fireEvent.click(screen.getByText("再試行"));
    expect(onRetry).toHaveBeenCalled();
    rerender(<ThreadList {...listProps} threads={[]} />);
    expect(screen.getByText("受信トレイは空です")).toBeInTheDocument();
  });

  it("選択中のスレッドを aria-current で示す", () => {
    render(<ThreadList {...listProps} threads={[thread()]} selectedId="t1" />);
    expect(screen.getByRole("button", { current: true })).toHaveTextContent("会議の件");
  });
});

const detail: ThreadDetail = {
  id: "t1",
  subject: "会議の件",
  messages: [
    {
      id: "m1",
      threadId: "t1",
      from: { name: "山田", email: "y@example.com" },
      to: [{ email: "me@example.com" }],
      cc: [],
      replyTo: [],
      subject: "会議の件",
      date: new Date().toISOString(),
      unread: true,
      snippet: "本文",
      text: "了解です\n\nOn Mon Taro wrote:\n> 元の本文",
      html: null,
      remoteImagesBlocked: true,
      attachments: [{ filename: "資料.pdf", mimeType: "application/pdf", size: 2048 }],
      isDraft: false,
      isSent: false,
    },
  ],
};

describe("ThreadView", () => {
  it("返信・全員に返信・既読・アーカイブの操作を発火する", () => {
    const onReply = vi.fn();
    const onToggleRead = vi.fn();
    const onArchive = vi.fn();
    const onShowImages = vi.fn();
    render(
      <ThreadView
        thread={detail}
        onReply={onReply}
        onToggleRead={onToggleRead}
        onArchive={onArchive}
        onShowImages={onShowImages}
        remoteImagesAllowed={false}
      />,
    );
    fireEvent.click(screen.getByText("返信"));
    expect(onReply).toHaveBeenCalledWith("m1", "reply");
    fireEvent.click(screen.getByText("全員に返信"));
    expect(onReply).toHaveBeenCalledWith("m1", "replyAll");
    fireEvent.click(screen.getByLabelText("既読にする"));
    expect(onToggleRead).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByLabelText("アーカイブ"));
    expect(onArchive).toHaveBeenCalled();
    fireEvent.click(screen.getByText("画像を表示"));
    expect(onShowImages).toHaveBeenCalled();
    expect(screen.getByText("資料.pdf")).toBeInTheDocument();
  });

  it("引用部分を折りたたんで表示する", () => {
    render(<TextBody text={"了解です\n\nOn Mon Taro wrote:\n> 元の本文"} />);
    expect(screen.getByText("了解です")).toBeInTheDocument();
    expect(screen.getByText("引用を表示").closest("details")).not.toHaveAttribute("open");
  });

  it("HTML本文は scripts を許可しない sandbox iframe と CSP で表示する", () => {
    render(<HtmlBody html="<p>hi</p>" allowRemoteImages={false} />);
    const frame = screen.getByTitle("メール本文") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).not.toContain("allow-scripts");
    expect(frame.getAttribute("srcdoc")).toContain("default-src 'none'; img-src data:;");
  });
});

describe("ComposeForm / SendConfirmDialog", () => {
  const value: ComposeValue = { to: "a@example.com", cc: "", bcc: "b@example.com", subject: "件名", body: "本文です" };

  it("送信ボタンは確認を要求し、送信中は二重に押せない", () => {
    const onRequestSend = vi.fn();
    const base = {
      title: "新規メッセージ",
      value,
      onChange: () => {},
      onSaveDraft: () => {},
      onRequestSend,
      onClose: () => {},
      showCcBcc: true,
      onToggleCcBcc: () => {},
    };
    const { rerender } = render(<ComposeForm {...base} status={{ kind: "idle" }} />);
    fireEvent.click(screen.getByText("送信…"));
    expect(onRequestSend).toHaveBeenCalledTimes(1);
    rerender(<ComposeForm {...base} status={{ kind: "sending" }} />);
    expect(screen.getByText("送信…").closest("button")).toBeDisabled();
    expect(screen.getByText(/送信中です/)).toBeInTheDocument();
    rerender(<ComposeForm {...base} status={{ kind: "unknown", message: "送信できたか確認できませんでした" }} onCheckStatus={() => {}} />);
    expect(screen.getByText("送信済みか確認")).toBeInTheDocument();
  });

  it("入力エラーを該当欄に表示する", () => {
    render(
      <ComposeForm
        title="t"
        value={{ ...value, to: "" }}
        onChange={() => {}}
        status={{ kind: "idle" }}
        fieldErrors={{ to: "宛先を入力してください" }}
        onSaveDraft={() => {}}
        onRequestSend={() => {}}
        onClose={() => {}}
        showCcBcc={false}
        onToggleCcBcc={() => {}}
      />,
    );
    expect(screen.getByText("宛先を入力してください")).toBeInTheDocument();
    expect(screen.getByLabelText("宛先")).toHaveAttribute("aria-invalid", "true");
  });

  it("確認ダイアログは宛先・Bcc・件名・本文を表示し、送信中は確定ボタンが無効", () => {
    const onConfirm = vi.fn();
    const { rerender } = render(<SendConfirmDialog value={value} sending={false} onConfirm={onConfirm} onCancel={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("a@example.com");
    expect(dialog).toHaveTextContent("b@example.com");
    expect(dialog).toHaveTextContent("件名");
    expect(dialog).toHaveTextContent("本文です");
    fireEvent.click(screen.getByText("送信する"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    rerender(<SendConfirmDialog value={value} sending onConfirm={onConfirm} onCancel={() => {}} />);
    expect(screen.getByText("送信する").closest("button")).toBeDisabled();
  });
});

describe("レイアウト・部品", () => {
  it("スマホでは一覧と詳細を切り替える（CSSクラスで制御）", () => {
    const { rerender } = render(<MailLayout nav={<p>nav</p>} list={<p>list</p>} detail={<p>detail</p>} showDetailOnMobile={false} />);
    expect(screen.getByText("list").closest("section")!.className).toContain("flex w-full");
    expect(screen.getByText("detail").closest("main")!.className).toMatch(/(^| )hidden( |$)/);
    rerender(<MailLayout nav={<p>nav</p>} list={<p>list</p>} detail={<p>detail</p>} showDetailOnMobile />);
    expect(screen.getByText("list").closest("section")!.className).toMatch(/(^| )hidden( |$)/);
    expect(screen.getByText("detail").closest("main")!.className).toContain("flex");
  });

  it("Banner はエラーを alert として読み上げる", () => {
    render(<Banner kind="error">失敗</Banner>);
    expect(screen.getByRole("alert")).toHaveTextContent("失敗");
  });

  it("Toggle は switch ロール", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="通知" />);
    fireEvent.click(screen.getByRole("switch", { name: "通知" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

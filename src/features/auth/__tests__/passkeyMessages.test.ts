import { passkeyErrorMessage } from "../passkeyMessages";

describe("passkeyErrorMessage", () => {
  it("says nothing when the person closed the prompt", () => {
    expect(passkeyErrorMessage({ code: "ERROR_CEREMONY_ABORTED" })).toBeNull();
    expect(
      passkeyErrorMessage({
        code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
        cause: { name: "NotAllowedError" },
      }),
    ).toBeNull();
  });

  it("explains the server's refusals", () => {
    expect(passkeyErrorMessage({ code: "passkey_disabled" })).toContain(
      "有効になっていません",
    );
    expect(
      passkeyErrorMessage({ code: "webauthn_credential_not_found" }),
    ).toContain("登録されていません");
    expect(
      passkeyErrorMessage({ code: "webauthn_credential_exists" }),
    ).toContain("すでに登録");
  });

  it("falls back to a general message", () => {
    expect(passkeyErrorMessage({ code: "something_new" })).toBe(
      "パスキーで認証できませんでした。",
    );
  });
});

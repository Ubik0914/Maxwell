import {
  authorizeRequestSchema,
  isAllowedRedirectUri,
  registerClientSchema,
  tokenRequestSchema,
} from "@/lib/validation/oauth";

const CODE_CHALLENGE = "a".repeat(43);
const CODE_VERIFIER = "b".repeat(43);

describe("isAllowedRedirectUri", () => {
  it("allows https", () => {
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/callback")).toBe(
      true,
    );
  });

  it("allows loopback http, for a client on the same machine", () => {
    expect(isAllowedRedirectUri("http://127.0.0.1:8080/cb")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:8080/cb")).toBe(true);
  });

  it("rejects plain http elsewhere", () => {
    expect(isAllowedRedirectUri("http://example.com/cb")).toBe(false);
  });

  it("rejects non-http(s) schemes and garbage", () => {
    expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedRedirectUri("not a url")).toBe(false);
  });
});

describe("registerClientSchema", () => {
  it("accepts a minimal public client registration", () => {
    const result = registerClientSchema.safeParse({
      redirect_uris: ["https://claude.ai/api/mcp/callback"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty redirect_uris list", () => {
    expect(registerClientSchema.safeParse({ redirect_uris: [] }).success).toBe(
      false,
    );
  });

  it("rejects a disallowed redirect_uri", () => {
    const result = registerClientSchema.safeParse({
      redirect_uris: ["http://attacker.example/cb"],
    });
    expect(result.success).toBe(false);
  });
});

describe("authorizeRequestSchema", () => {
  const valid = {
    response_type: "code",
    client_id: "abc123",
    redirect_uri: "https://claude.ai/api/mcp/callback",
    code_challenge: CODE_CHALLENGE,
    code_challenge_method: "S256",
  };

  it("accepts a well-formed request", () => {
    expect(authorizeRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects any response_type but code", () => {
    expect(
      authorizeRequestSchema.safeParse({ ...valid, response_type: "token" })
        .success,
    ).toBe(false);
  });

  it("rejects the plain PKCE method", () => {
    expect(
      authorizeRequestSchema.safeParse({
        ...valid,
        code_challenge_method: "plain",
      }).success,
    ).toBe(false);
  });

  it("carries state and resource through when present", () => {
    const result = authorizeRequestSchema.safeParse({
      ...valid,
      state: "xyz",
      resource: "https://maxwell-bay.vercel.app/api/mcp",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.state).toBe("xyz");
    }
  });
});

describe("tokenRequestSchema", () => {
  it("accepts an authorization_code grant", () => {
    const result = tokenRequestSchema.safeParse({
      grant_type: "authorization_code",
      code: "somecode",
      redirect_uri: "https://claude.ai/api/mcp/callback",
      client_id: "abc123",
      code_verifier: CODE_VERIFIER,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a refresh_token grant", () => {
    const result = tokenRequestSchema.safeParse({
      grant_type: "refresh_token",
      refresh_token: "sometoken",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an authorization_code grant missing code_verifier", () => {
    const result = tokenRequestSchema.safeParse({
      grant_type: "authorization_code",
      code: "somecode",
      redirect_uri: "https://claude.ai/api/mcp/callback",
      client_id: "abc123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown grant_type", () => {
    const result = tokenRequestSchema.safeParse({
      grant_type: "password",
      username: "a",
      password: "b",
    });
    expect(result.success).toBe(false);
  });
});

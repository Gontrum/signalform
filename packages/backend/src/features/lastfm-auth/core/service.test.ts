import { describe, expect, it } from "vitest";
import { buildAuthUrl, buildSignature } from "./service.js";

describe("buildSignature", () => {
  it("sorts params alphabetically and produces the correct MD5 hash", () => {
    // params: method=auth.getSession, token=ABC123
    // sorted: method, token -> "methodauth.getSessiontokenABC123" + "mysecret"
    // MD5("methodauth.getSessiontokenABC123mysecret") = 6f12d4e926b339fa0f94bb65ac4f4b9e
    const result = buildSignature(
      { token: "ABC123", method: "auth.getSession" },
      "mysecret",
    );

    expect(result).toBe("6f12d4e926b339fa0f94bb65ac4f4b9e");
  });

  it("excludes 'format' and 'callback' from the signature even if passed", () => {
    // Same params as above plus format and callback — result must be identical
    const result = buildSignature(
      {
        token: "ABC123",
        method: "auth.getSession",
        format: "json",
        callback: "cb",
      },
      "mysecret",
    );

    expect(result).toBe("6f12d4e926b339fa0f94bb65ac4f4b9e");
  });

  it("hashes correctly when params contain only 'format' and 'callback' (all excluded)", () => {
    // All params excluded → string becomes just the secret
    // MD5("mysecret") = 06c219e5bc8378f3a8a3f83b4b7e4649
    const result = buildSignature(
      { format: "json", callback: "cb" },
      "mysecret",
    );

    expect(result).toBe("06c219e5bc8378f3a8a3f83b4b7e4649");
  });

  it("hashes correctly with empty params (only secret)", () => {
    // MD5("mysecret") = 06c219e5bc8378f3a8a3f83b4b7e4649
    const result = buildSignature({}, "mysecret");

    expect(result).toBe("06c219e5bc8378f3a8a3f83b4b7e4649");
  });

  it("returns a lowercase hex string of 32 characters", () => {
    const result = buildSignature({ api_key: "key1" }, "secret");

    expect(result).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("buildAuthUrl", () => {
  it("returns the correct Last.fm auth URL", () => {
    const url = buildAuthUrl("myapikey", "mytoken");

    expect(url).toBe(
      "https://www.last.fm/api/auth/?api_key=myapikey&token=mytoken",
    );
  });

  it("uses the raw apiKey and token without encoding", () => {
    const url = buildAuthUrl("abc123def456", "tokenvalue99");

    expect(url).toBe(
      "https://www.last.fm/api/auth/?api_key=abc123def456&token=tokenvalue99",
    );
  });
});

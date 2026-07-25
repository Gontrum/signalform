import { describe, expect, it } from "vitest";
import { buildAuthUrl, buildSignature } from "./service.js";

const identityHash = (input: string): string => input;

describe("buildSignature", () => {
  it("sorts params alphabetically and produces the correct pre-hash string", () => {
    // params: method=auth.getSession, token=ABC123
    // sorted: method, token -> "methodauth.getSessiontokenABC123" + "mysecret"
    // pre-hash string: "methodauth.getSessiontokenABC123mysecret"
    const result = buildSignature(
      { token: "ABC123", method: "auth.getSession" },
      "mysecret",
      identityHash,
    );

    expect(result).toBe("methodauth.getSessiontokenABC123mysecret");
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
      identityHash,
    );

    expect(result).toBe("methodauth.getSessiontokenABC123mysecret");
  });

  it("hashes correctly when params contain only 'format' and 'callback' (all excluded)", () => {
    // All params excluded → string becomes just the secret
    // pre-hash string: "mysecret"
    const result = buildSignature(
      { format: "json", callback: "cb" },
      "mysecret",
      identityHash,
    );

    expect(result).toBe("mysecret");
  });

  it("hashes correctly with empty params (only secret)", () => {
    // pre-hash string: "mysecret"
    const result = buildSignature({}, "mysecret", identityHash);

    expect(result).toBe("mysecret");
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

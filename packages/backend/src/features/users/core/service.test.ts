import { describe, expect, it } from "vitest";
import {
  addUser,
  findUserById,
  hasAnySession,
  maskUsers,
  removeUser,
  renameUser,
  resolveActiveUser,
  resolveRequestUser,
  shouldClaimListener,
  updateUserSession,
} from "./service.js";
import type { UserProfile } from "../../../infrastructure/config/index.js";

const alice: UserProfile = {
  id: "user-alice",
  name: "Alice",
  lastFmUsername: "alice_fm",
  lastFmSessionKey: "alice-session-key",
};

const bob: UserProfile = {
  id: "user-bob",
  name: "Bob",
};

describe("resolveRequestUser", () => {
  it("resolves the user matching the header value", () => {
    expect(resolveRequestUser([alice, bob], "user-bob")).toBe(bob);
  });

  it("falls back to the only user when no header is present", () => {
    expect(resolveRequestUser([alice], undefined)).toBe(alice);
  });

  it("returns undefined for an unknown header with multiple users", () => {
    expect(resolveRequestUser([alice, bob], "user-unknown")).toBeUndefined();
  });

  it("returns undefined without a header when multiple users exist", () => {
    expect(resolveRequestUser([alice, bob], undefined)).toBeUndefined();
  });

  it("returns undefined for an empty user list", () => {
    expect(resolveRequestUser([], undefined)).toBeUndefined();
    expect(resolveRequestUser([], "user-alice")).toBeUndefined();
  });
});

describe("resolveActiveUser", () => {
  it("resolves the user matching the active id", () => {
    expect(resolveActiveUser([alice, bob], "user-bob")).toBe(bob);
  });

  it("falls back to the first user when the id does not match", () => {
    expect(resolveActiveUser([alice, bob], "user-unknown")).toBe(alice);
  });

  it("falls back to the first user when no id is given", () => {
    expect(resolveActiveUser([alice, bob], undefined)).toBe(alice);
  });

  it("returns undefined for an empty user list", () => {
    expect(resolveActiveUser([], undefined)).toBeUndefined();
    expect(resolveActiveUser([], "user-alice")).toBeUndefined();
  });
});

describe("addUser", () => {
  it("appends a new user with the given id and trimmed name", () => {
    const result = addUser([alice], "  Carol  ", "user-carol");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        alice,
        { id: "user-carol", name: "Carol" },
      ]);
    }
  });

  it("rejects an empty name", () => {
    const result = addUser([], "   ", "user-carol");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("INVALID_NAME");
    }
  });
});

describe("renameUser", () => {
  it("renames the matching user with a trimmed name", () => {
    const result = renameUser([alice, bob], "user-bob", "  Robert ");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([alice, { id: "user-bob", name: "Robert" }]);
    }
  });

  it("rejects an unknown user id", () => {
    const result = renameUser([alice], "user-unknown", "Robert");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("USER_NOT_FOUND");
    }
  });

  it("rejects an empty name", () => {
    const result = renameUser([alice], "user-alice", "  ");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("INVALID_NAME");
    }
  });
});

describe("removeUser", () => {
  it("removes the matching user", () => {
    const result = removeUser([alice, bob], "user-alice");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([bob]);
    }
  });

  it("rejects an unknown user id", () => {
    const result = removeUser([alice], "user-unknown");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("USER_NOT_FOUND");
    }
  });
});

describe("updateUserSession", () => {
  it("sets the Last.fm session of the matching user", () => {
    const result = updateUserSession([alice, bob], "user-bob", {
      lastFmUsername: "bob_fm",
      lastFmSessionKey: "bob-session-key",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        alice,
        {
          id: "user-bob",
          name: "Bob",
          lastFmUsername: "bob_fm",
          lastFmSessionKey: "bob-session-key",
        },
      ]);
    }
  });

  it("clears the Last.fm session when passed undefined", () => {
    const result = updateUserSession([alice, bob], "user-alice", undefined);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const updated = result.value[0];
      expect(updated?.lastFmUsername).toBeUndefined();
      expect(updated?.lastFmSessionKey).toBeUndefined();
      expect(result.value[1]).toBe(bob);
    }
  });

  it("rejects an unknown user id", () => {
    const result = updateUserSession([alice], "user-unknown", undefined);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("USER_NOT_FOUND");
    }
  });
});

describe("maskUsers", () => {
  it("never exposes the session key and computes hasLastFmSession", () => {
    const result = maskUsers([alice, bob]);

    expect(result).toEqual([
      {
        id: "user-alice",
        name: "Alice",
        lastFmUsername: "alice_fm",
        hasLastFmSession: true,
      },
      { id: "user-bob", name: "Bob", hasLastFmSession: false },
    ]);
    expect(result[0] !== undefined && "lastFmSessionKey" in result[0]).toBe(
      false,
    );
  });

  it("treats a whitespace-only session key as no session", () => {
    const result = maskUsers([{ ...bob, lastFmSessionKey: "   " }]);

    expect(result[0]?.hasLastFmSession).toBe(false);
  });
});

describe("findUserById", () => {
  it("returns the user with the matching id", () => {
    expect(findUserById([alice, bob], "user-bob")).toBe(bob);
  });

  it("returns undefined for an unknown id", () => {
    expect(findUserById([alice, bob], "user-unknown")).toBeUndefined();
  });

  it("returns undefined for an empty user list", () => {
    expect(findUserById([], "user-alice")).toBeUndefined();
  });
});

describe("shouldClaimListener", () => {
  const claimPaths: readonly string[] = [
    "/api/playback/play",
    "/api/queue/jump",
  ];

  const claimInput = {
    method: "POST",
    statusCode: 200,
    path: "/api/playback/play",
    headerValue: "user-alice",
    users: [alice, bob],
    claimPaths,
  };

  it("claims for a successful POST to a claim path by a known user", () => {
    expect(shouldClaimListener(claimInput)).toBe("user-alice");
  });

  it("strips a query string before matching the path", () => {
    expect(
      shouldClaimListener({ ...claimInput, path: "/api/queue/jump?index=3" }),
    ).toBe("user-alice");
  });

  it("does not claim for non-POST methods", () => {
    expect(shouldClaimListener({ ...claimInput, method: "GET" })).toBe(
      undefined,
    );
    expect(shouldClaimListener({ ...claimInput, method: "PUT" })).toBe(
      undefined,
    );
  });

  it("does not claim for 4xx or 5xx responses", () => {
    expect(shouldClaimListener({ ...claimInput, statusCode: 400 })).toBe(
      undefined,
    );
    expect(shouldClaimListener({ ...claimInput, statusCode: 500 })).toBe(
      undefined,
    );
  });

  it("does not claim for a path outside the claim paths", () => {
    expect(
      shouldClaimListener({ ...claimInput, path: "/api/playback/pause" }),
    ).toBe(undefined);
  });

  it("does not claim for an unknown user id", () => {
    expect(
      shouldClaimListener({ ...claimInput, headerValue: "user-unknown" }),
    ).toBe(undefined);
  });

  it("does not claim when the header is missing", () => {
    expect(shouldClaimListener({ ...claimInput, headerValue: undefined })).toBe(
      undefined,
    );
  });
});

describe("hasAnySession", () => {
  it("is true when at least one user has a session key", () => {
    expect(hasAnySession([bob, alice])).toBe(true);
  });

  it("is false when no user has a session key", () => {
    expect(hasAnySession([bob])).toBe(false);
  });

  it("is false for an empty-string session key", () => {
    expect(hasAnySession([{ ...bob, lastFmSessionKey: "" }])).toBe(false);
  });

  it("is false for an empty user list", () => {
    expect(hasAnySession([])).toBe(false);
  });
});

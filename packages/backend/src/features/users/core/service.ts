import { err, ok, type Result } from "@signalform/shared";
import type { UserProfile } from "../../../infrastructure/config/index.js";

export type UsersError = {
  readonly type: "USER_NOT_FOUND" | "INVALID_NAME";
  readonly message: string;
};

export type MaskedUser = {
  readonly id: string;
  readonly name: string;
  readonly lastFmUsername?: string;
  readonly hasLastFmSession: boolean;
};

const userNotFound = (id: string): UsersError => ({
  type: "USER_NOT_FOUND",
  message: `No user with id "${id}"`,
});

const invalidName = (): UsersError => ({
  type: "INVALID_NAME",
  message: "User name must not be empty",
});

/** Looks up a user by exact id — no fallback. */
export const findUserById = (
  users: readonly UserProfile[],
  id: string,
): UserProfile | undefined => users.find((user) => user.id === id);

/**
 * Resolves the user a request acts on behalf of.
 * Falls back to the only user when no header matches, so single-user
 * installs without the header keep working.
 */
export const resolveRequestUser = (
  users: readonly UserProfile[],
  headerValue: string | undefined,
): UserProfile | undefined => {
  if (headerValue !== undefined) {
    const matched = findUserById(users, headerValue);
    if (matched !== undefined) {
      return matched;
    }
  }
  return users.length === 1 ? users[0] : undefined;
};

/** Resolves the active user by id, falling back to the first user. */
export const resolveActiveUser = (
  users: readonly UserProfile[],
  activeId: string | undefined,
): UserProfile | undefined => {
  if (activeId !== undefined) {
    const matched = findUserById(users, activeId);
    if (matched !== undefined) {
      return matched;
    }
  }
  return users[0];
};

export const addUser = (
  users: readonly UserProfile[],
  name: string,
  id: string,
): Result<readonly UserProfile[], UsersError> => {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return err(invalidName());
  }
  return ok([...users, { id, name: trimmed }]);
};

export const renameUser = (
  users: readonly UserProfile[],
  id: string,
  name: string,
): Result<readonly UserProfile[], UsersError> => {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return err(invalidName());
  }
  if (findUserById(users, id) === undefined) {
    return err(userNotFound(id));
  }
  return ok(
    users.map((user) => (user.id === id ? { ...user, name: trimmed } : user)),
  );
};

export const removeUser = (
  users: readonly UserProfile[],
  id: string,
): Result<readonly UserProfile[], UsersError> => {
  if (findUserById(users, id) === undefined) {
    return err(userNotFound(id));
  }
  return ok(users.filter((user) => user.id !== id));
};

/** Sets or clears (`undefined`) the Last.fm session of a user. */
export const updateUserSession = (
  users: readonly UserProfile[],
  id: string,
  session:
    | { readonly lastFmUsername: string; readonly lastFmSessionKey: string }
    | undefined,
): Result<readonly UserProfile[], UsersError> => {
  if (findUserById(users, id) === undefined) {
    return err(userNotFound(id));
  }
  return ok(
    users.map((user) =>
      user.id === id
        ? {
            id: user.id,
            name: user.name,
            ...(session !== undefined
              ? {
                  lastFmUsername: session.lastFmUsername,
                  lastFmSessionKey: session.lastFmSessionKey,
                }
              : {}),
          }
        : user,
    ),
  );
};

/** Returns users safe to expose in API responses — session keys masked. */
export const maskUsers = (
  users: readonly UserProfile[],
): readonly MaskedUser[] =>
  users.map((user) => ({
    id: user.id,
    name: user.name,
    ...(user.lastFmUsername !== undefined
      ? { lastFmUsername: user.lastFmUsername }
      : {}),
    hasLastFmSession:
      user.lastFmSessionKey !== undefined &&
      user.lastFmSessionKey.trim().length > 0,
  }));

export const hasAnySession = (users: readonly UserProfile[]): boolean =>
  users.some(
    (user) =>
      user.lastFmSessionKey !== undefined &&
      user.lastFmSessionKey.trim().length > 0,
  );

/**
 * Decides whether a completed request claims the active-listener slot.
 * Returns the id of the user to claim, or `undefined` when the request
 * does not qualify: only successful (< 400) POSTs to a claim path with a
 * header value matching an existing user count.
 */
export const shouldClaimListener = (input: {
  readonly method: string;
  readonly statusCode: number;
  readonly path: string;
  readonly headerValue: string | undefined;
  readonly users: readonly UserProfile[];
  readonly claimPaths: readonly string[];
}): string | undefined => {
  if (input.method !== "POST" || input.statusCode >= 400) {
    return undefined;
  }

  const path = input.path.split("?")[0];
  if (path === undefined || !input.claimPaths.includes(path)) {
    return undefined;
  }

  if (input.headerValue === undefined) {
    return undefined;
  }

  return findUserById(input.users, input.headerValue) !== undefined
    ? input.headerValue
    : undefined;
};

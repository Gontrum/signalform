/**
 * No-Real-LMS Guard
 *
 * Prevents tests from accidentally connecting to a real Lyrion Music Server
 * instance.  Only loopback addresses are considered safe.
 *
 * Usage:
 *   assertSafeTestLmsTarget("localhost:9000", "my-test")  // ok
 *   assertSafeTestLmsTarget("192.168.1.10:9000", "my-test")  // throws
 */

const SAFE_LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Extract the hostname from a bare host[:port] string or a full URL.
 * Returns null when the input cannot be parsed.
 */
const extractHost = (input: string): string | null => {
  const trimmed = input.trim();
  if (trimmed === "") {
    return null;
  }
  try {
    const url = new URL(
      trimmed.includes("://") ? trimmed : `http://${trimmed}`,
    );
    return url.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
};

/**
 * Throw if `input` does not resolve to a loopback address.
 *
 * @param input        - Host, host:port, or full URL pointing at LMS
 * @param contextLabel - Human-readable label for the calling test/setup
 */
export const assertSafeTestLmsTarget = (
  input: string,
  contextLabel: string,
): void => {
  const host = extractHost(input);
  if (host !== null && SAFE_LOOPBACK_HOSTS.has(host)) {
    return;
  }

  const safe = [...SAFE_LOOPBACK_HOSTS].join(", ");
  throw new Error(
    `[no-real-lms-guard] Unsafe LMS target "${input}" in ${contextLabel}. ` +
      `Only loopback addresses are allowed in tests (${safe}). ` +
      `Set LMS_HOST to one of these values.`,
  );
};

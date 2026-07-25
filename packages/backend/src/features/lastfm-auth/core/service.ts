const EXCLUDED_SIG_PARAMS = new Set(["format", "callback"]);

/**
 * Builds an MD5 signature per Last.fm spec:
 * Filter out `format` and `callback`, sort remaining params alphabetically,
 * concatenate key+value pairs, append sharedSecret, hash.
 * The hash function is injected by the caller so this stays framework/Node-free.
 */
export const buildSignature = (
  params: Readonly<Record<string, string>>,
  sharedSecret: string,
  hash: (input: string) => string,
): string => {
  const sorted = Object.keys(params)
    .filter((key) => !EXCLUDED_SIG_PARAMS.has(key))
    .sort();
  const str =
    sorted.map((key) => `${key}${params[key] ?? ""}`).join("") + sharedSecret;
  return hash(str);
};

/**
 * Builds the Last.fm auth URL for the desktop auth flow.
 */
export const buildAuthUrl = (apiKey: string, token: string): string =>
  `https://www.last.fm/api/auth/?api_key=${apiKey}&token=${token}`;

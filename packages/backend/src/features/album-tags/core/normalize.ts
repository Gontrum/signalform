const COMBINING_MARKS = /\p{M}+/gu;
const TRAILING_BRACKETS = /[([{][^()[\]{}]*[)\]}]\s*$/u;
const APOSTROPHES = /['‘’ʼ`´]+/gu;
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;
const WHITESPACE = /\s+/gu;

const stripDiacritics = (value: string): string =>
  value.normalize("NFD").replace(COMBINING_MARKS, "");

const stripTrailingBrackets = (value: string): string => {
  const stripped = value.replace(TRAILING_BRACKETS, "").trim();
  if (stripped === value.trim()) {
    return stripped;
  }
  // A title that is nothing but a bracketed suffix keeps its original text —
  // an empty normalization would match every other album.
  if (stripped === "") {
    return value.trim();
  }
  return stripTrailingBrackets(stripped);
};

export const normalizeForMatch = (value: string): string =>
  stripTrailingBrackets(stripDiacritics(value.toLowerCase()))
    .replace(APOSTROPHES, "")
    .replace(NON_ALPHANUMERIC, " ")
    .replace(WHITESPACE, " ")
    .trim();

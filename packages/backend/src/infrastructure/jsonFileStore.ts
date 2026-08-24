import fs from "node:fs";
import path from "node:path";
import { err, fromThrowable, ok, type Result } from "@signalform/shared";

export type JsonRecord = { readonly [key: string]: unknown };

export const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const readNonEmptyString = (
  record: JsonRecord,
  key: string,
): string | undefined => {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
};

export const readPositiveNumber = (
  record: JsonRecord,
  key: string,
): number | undefined => {
  const value = record[key];
  return typeof value === "number" && value > 0 ? value : undefined;
};

/**
 * Parses a JSON file's contents into a plain object. Error strings are
 * intentionally untyped so each caller can wrap them into its own error union.
 */
export const parseJsonObject = (
  raw: string,
  fileLabel: string,
): Result<JsonRecord, string> => {
  const parsedResult = fromThrowable(
    () => JSON.parse(raw) as unknown,
    () => `${fileLabel} contains invalid JSON`,
  );

  if (!parsedResult.ok) {
    return parsedResult;
  }

  if (!isJsonRecord(parsedResult.value)) {
    return err(`${fileLabel} must be a JSON object`);
  }

  return ok(parsedResult.value);
};

/**
 * Writes to a tmp file and renames it into place, so concurrent readers
 * never observe a partially written file (rename is atomic on POSIX).
 */
export const writeFileAtomic = (
  targetPath: string,
  content: string,
  tmpPrefix: string,
): Result<void, string> => {
  const dir = path.dirname(targetPath);
  const tmpPath = path.join(
    dir,
    `${tmpPrefix}-${Date.now()}-${process.pid}.json`,
  );

  const writeResult = fromThrowable(
    () => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(tmpPath, content, "utf-8");
      fs.renameSync(tmpPath, targetPath);
    },
    (error): string => (error instanceof Error ? error.message : String(error)),
  );

  if (!writeResult.ok) {
    if (fs.existsSync(tmpPath)) {
      void fromThrowable(
        () => fs.unlinkSync(tmpPath),
        () => undefined,
      );
    }

    return writeResult;
  }

  return ok(undefined);
};

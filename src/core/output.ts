import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import type { JsonObject, OutputFormat } from "./types";

export function renderOutput(value: unknown, format: OutputFormat): string {
  if (format === "json") return `${JSON.stringify(value, null, 2)}\n`;
  const records = asRecords(value);
  if (format === "jsonl") return records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : "");
  if (format !== "csv") throw new Error("error.format");
  if (records.length === 0) return "";

  const fields: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    for (const field of Object.keys(record)) {
      if (!seen.has(field)) {
        fields.push(field);
        seen.add(field);
      }
    }
  }
  const rows = [fields.map(csvCell).join(",")];
  for (const record of records) rows.push(fields.map((field) => csvCell(csvValue(record[field]))).join(","));
  return `${rows.join("\r\n")}\r\n`;
}

export async function writeOutputAtomic(filePath: string, content: string): Promise<void> {
  const directory = dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, `.${basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function asRecords(value: unknown): JsonObject[] {
  if (isObject(value)) return [value];
  if (Array.isArray(value) && value.every(isObject)) return value;
  throw new Error("error.output");
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

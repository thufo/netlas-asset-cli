import { isIP } from "node:net";
import { MAX_SEARCH_LIMIT, type Language, type OutputFormat } from "./types";

const DOMAIN_RE = /^(?=.{1,253}\.?$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.?$/i;

export function validateTarget(value: string): string {
  const target = value.trim();
  if (isIP(target)) return target;
  if (DOMAIN_RE.test(target)) return target.replace(/\.$/, "").toLowerCase();
  throw new Error("error.targetInvalid");
}

export function validateQuery(value: string): string {
  const query = value.trim();
  if (!query) throw new Error("error.queryRequired");
  return query;
}

export function validateLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_SEARCH_LIMIT) throw new Error("error.limitInvalid");
  return value;
}

export function validateTimeout(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error("error.timeoutInvalid");
  return value;
}

export function validateRetries(value: number): number {
  if (!Number.isInteger(value) || value < 0) throw new Error("error.retriesInvalid");
  return value;
}

export function validateBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("error.baseUrlInvalid");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("error.baseUrlInvalid");
  if (url.username || url.password || url.search || url.hash) throw new Error("error.baseUrlInvalid");
  return url.toString().replace(/\/$/, "");
}

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "zh-CN" || value === "ru";
}

export function isOutputFormat(value: unknown): value is OutputFormat {
  return value === "json" || value === "jsonl" || value === "csv";
}

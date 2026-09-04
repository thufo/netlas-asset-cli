import { setTimeout as delay } from "node:timers/promises";
import { DEFAULT_BASE_URL, DEFAULT_RETRIES, DEFAULT_TIMEOUT_SECONDS, VERSION, type JsonObject } from "./types";
import { validateBaseUrl, validateLimit, validateQuery, validateTarget } from "./validation";

export type NetlasErrorCode = "validation" | "http" | "network" | "timeout" | "cancelled" | "invalidJson" | "invalidResponse";

export class NetlasError extends Error {
  constructor(
    public readonly code: NetlasErrorCode,
    public readonly translationKey: string,
    public readonly values: Record<string, string | number> = {},
    options?: ErrorOptions,
  ) {
    super(translationKey, options);
    this.name = "NetlasError";
  }
}

export interface NetlasClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutSeconds?: number;
  maxRetries?: number;
  retryBackoffMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}

export class NetlasClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBackoffMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  private readonly now: () => number;

  constructor(options: NetlasClientOptions) {
    this.apiKey = options.apiKey.trim();
    if (!this.apiKey) throw new NetlasError("validation", "error.apiKeyMissing");
    this.baseUrl = validateBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.timeoutMs = (options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000;
    this.maxRetries = options.maxRetries ?? DEFAULT_RETRIES;
    this.retryBackoffMs = options.retryBackoffMs ?? 500;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new NetlasError("validation", "error.timeoutInvalid");
    if (!Number.isInteger(this.maxRetries) || this.maxRetries < 0) throw new NetlasError("validation", "error.retriesInvalid");
    if (!Number.isFinite(this.retryBackoffMs) || this.retryBackoffMs < 0) throw new NetlasError("validation", "error.retriesInvalid");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? (async (milliseconds, signal) => delay(milliseconds, undefined, { signal }));
    this.now = options.now ?? Date.now;
  }

  async hostSummary(target: string, signal?: AbortSignal): Promise<JsonObject> {
    let validTarget: string;
    try {
      validTarget = validateTarget(target);
    } catch (error) {
      throw new NetlasError("validation", (error as Error).message, {}, { cause: error });
    }
    const value = await this.get(`/api/host/${encodeURIComponent(validTarget)}/`, { public_indices_only: "true" }, signal);
    if (!isObject(value)) throw new NetlasError("invalidResponse", "error.hostResponse");
    return value;
  }

  async searchResponses(query: string, limit = 20, signal?: AbortSignal): Promise<JsonObject[]> {
    let validQuery: string;
    try {
      validQuery = validateQuery(query);
      validateLimit(limit);
    } catch (error) {
      throw new NetlasError("validation", (error as Error).message, {}, { cause: error });
    }

    const results: JsonObject[] = [];
    let start = 0;
    while (results.length < limit) {
      const payload = await this.get("/api/responses/", { q: validQuery, start, source_type: "include" }, signal);
      if (!isObject(payload) || !Array.isArray(payload.items)) {
        throw new NetlasError("invalidResponse", "error.searchResponse");
      }
      if (payload.items.length === 0) break;
      for (const item of payload.items) {
        if (isObject(item) && isObject(item.data)) {
          results.push(item.data);
          if (results.length >= limit) break;
        }
      }
      start += payload.items.length;
      if (payload.items.length < 20) break;
    }
    return results;
  }

  private async get(path: string, params: Record<string, string | number>, callerSignal?: AbortSignal): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));

    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error("timeout")), this.timeoutMs);
      const onCallerAbort = () => controller.abort(callerSignal?.reason ?? new Error("cancelled"));
      callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
      try {
        const response = await this.fetchImpl(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.apiKey}`,
            "User-Agent": `netlas-asset-cli/${VERSION}`,
          },
          signal: controller.signal,
        });
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt < this.maxRetries) {
            const retryMs = this.retryDelay(response.headers.get("retry-after"), attempt);
            await this.sleep(retryMs, callerSignal);
            continue;
          }
          const rawDetail = (await response.text()).trim().slice(0, 300);
          const safeDetail = this.sanitize(rawDetail);
          throw new NetlasError("http", "error.http", {
            status: response.status,
            detail: safeDetail ? `: ${safeDetail}` : "",
          });
        }
        try {
          return await response.json();
        } catch (error) {
          throw new NetlasError("invalidJson", "error.invalidJson", {}, { cause: error });
        }
      } catch (error) {
        if (error instanceof NetlasError) throw error;
        if (controller.signal.aborted) {
          if (callerSignal?.aborted) throw new NetlasError("cancelled", "error.cancelled", {}, { cause: error });
          throw new NetlasError("timeout", "error.timeout", {}, { cause: error });
        }
        throw new NetlasError("network", "error.network", { reason: this.sanitize(errorMessage(error)) }, { cause: error });
      } finally {
        clearTimeout(timeout);
        callerSignal?.removeEventListener("abort", onCallerAbort);
      }
    }
  }

  private retryDelay(value: string | null, attempt: number): number {
    if (value !== null) {
      const seconds = Number(value);
      if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1000, 0), 60_000);
      const date = Date.parse(value);
      if (Number.isFinite(date)) return Math.min(Math.max(date - this.now(), 0), 60_000);
    }
    return Math.min(this.retryBackoffMs * 2 ** attempt, 30_000);
  }

  private sanitize(value: string): string {
    return value.replaceAll(this.apiKey, "[REDACTED]").replace(/[\r\n\t]+/g, " ").trim();
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

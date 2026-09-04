import { describe, expect, it, vi } from "vitest";
import { NetlasClient, NetlasError } from "../src/core/client";

const jsonResponse = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), {
  status: init.status ?? 200,
  headers: { "content-type": "application/json", ...(init.headers || {}) },
});

describe("NetlasClient", () => {
  it("uses Bearer auth, encodes the target, and requests public indices", async () => {
    const fetchImpl = vi.fn(async (_input: URL | RequestInfo, _init?: RequestInit) => jsonResponse({ domain: "example.com" }));
    const client = new NetlasClient({ apiKey: "secret", baseUrl: "https://example.test", fetchImpl });
    await expect(client.hostSummary("example.com")).resolves.toEqual({ domain: "example.com" });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://example.test/api/host/example.com/?public_indices_only=true");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer secret");
  });

  it("paginates response data and applies the requested limit", async () => {
    const first = { items: Array.from({ length: 20 }, (_, index) => ({ data: { host: `192.0.2.${index}` } })) };
    const second = { items: [{ data: { host: "192.0.2.20" } }] };
    const fetchImpl = vi.fn((_input: URL | RequestInfo, _init?: RequestInit): Promise<Response> => Promise.resolve(jsonResponse({})))
      .mockResolvedValueOnce(jsonResponse(first))
      .mockResolvedValueOnce(jsonResponse(second));
    const client = new NetlasClient({ apiKey: "secret", fetchImpl });
    const result = await client.searchResponses("port:443", 21);
    expect(result).toHaveLength(21);
    expect(String(fetchImpl.mock.calls[1]![0])).toContain("start=20");
  });

  it("rejects an excessive local limit", async () => {
    const client = new NetlasClient({ apiKey: "secret", fetchImpl: vi.fn() });
    await expect(client.searchResponses("port:443", 201)).rejects.toMatchObject({ translationKey: "error.limitInvalid" });
  });

  it("retries HTTP 429 using numeric Retry-After", async () => {
    const fetchImpl = vi.fn((_input: URL | RequestInfo, _init?: RequestInit): Promise<Response> => Promise.resolve(jsonResponse({})))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const sleep = vi.fn(async (_milliseconds: number, _signal?: AbortSignal) => undefined);
    const client = new NetlasClient({ apiKey: "secret", fetchImpl, sleep, maxRetries: 1 });
    await client.hostSummary("example.com");
    expect(sleep).toHaveBeenCalledWith(2000, undefined);
  });

  it("supports HTTP-date Retry-After and caps it at 60 seconds", async () => {
    const fetchImpl = vi.fn((_input: URL | RequestInfo, _init?: RequestInit): Promise<Response> => Promise.resolve(jsonResponse({})))
      .mockResolvedValueOnce(new Response("busy", { status: 503, headers: { "retry-after": "Wed, 21 Oct 2037 07:28:00 GMT" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const sleep = vi.fn(async (_milliseconds: number, _signal?: AbortSignal) => undefined);
    const client = new NetlasClient({ apiKey: "secret", fetchImpl, sleep, maxRetries: 1, now: () => 0 });
    await client.hostSummary("example.com");
    expect(sleep).toHaveBeenCalledWith(60_000, undefined);
  });

  it("uses exponential backoff for server errors", async () => {
    const fetchImpl = vi.fn((_input: URL | RequestInfo, _init?: RequestInit): Promise<Response> => Promise.resolve(jsonResponse({})))
      .mockResolvedValueOnce(new Response("busy", { status: 500 }))
      .mockResolvedValueOnce(new Response("busy", { status: 502 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const sleep = vi.fn(async (_milliseconds: number, _signal?: AbortSignal) => undefined);
    const client = new NetlasClient({ apiKey: "secret", fetchImpl, sleep, maxRetries: 2, retryBackoffMs: 250 });
    await client.hostSummary("example.com");
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([250, 500]);
  });

  it("redacts the API key from HTTP error details", async () => {
    const client = new NetlasClient({ apiKey: "secret", maxRetries: 0, fetchImpl: vi.fn(async () => new Response("bad secret", { status: 403 })) });
    let error: NetlasError | undefined;
    try { await client.hostSummary("example.com"); } catch (value) { error = value as NetlasError; }
    expect(error?.values.detail).toBe(": bad [REDACTED]");
  });

  it("reports invalid JSON", async () => {
    const client = new NetlasClient({ apiKey: "secret", fetchImpl: vi.fn(async () => new Response("not-json")) });
    await expect(client.hostSummary("example.com")).rejects.toMatchObject({ translationKey: "error.invalidJson" });
  });

  it("supports cancellation", async () => {
    const fetchImpl = vi.fn((_input: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const client = new NetlasClient({ apiKey: "secret", fetchImpl, timeoutSeconds: 10 });
    const controller = new AbortController();
    const pending = client.hostSummary("example.com", controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ translationKey: "error.cancelled" });
  });
});

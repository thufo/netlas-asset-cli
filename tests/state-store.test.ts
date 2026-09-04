import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { QueryRequest } from "../src/core/types";
import { StateStore } from "../src/desktop/state-store";

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

const request = (input: string): QueryRequest => ({ mode: "search", input, options: { limit: 20, timeout: 30, retries: 2 } });

describe("StateStore", () => {
  it("stores request metadata but never response data or API keys", async () => {
    const directory = await mkdtemp(join(tmpdir(), "netlas-state-")); directories.push(directory);
    const path = join(directory, "state.json");
    const store = new StateStore(path); await store.load();
    await store.addHistory(request("port:443"), true);
    const raw = await readFile(path, "utf8");
    expect(raw).toContain("port:443");
    expect(raw).not.toContain("apiKey");
    expect(raw).not.toContain("response");
  });

  it("deduplicates identical queries and preserves favorites", async () => {
    const directory = await mkdtemp(join(tmpdir(), "netlas-state-")); directories.push(directory);
    const store = new StateStore(join(directory, "state.json")); await store.load();
    await store.addHistory(request("port:443"), true);
    const id = store.getHistory()[0]!.id;
    await store.toggleFavorite(id);
    await store.addHistory(request("port:443"), false);
    expect(store.getHistory()).toHaveLength(1);
    expect(store.getHistory()[0]).toMatchObject({ id, favorite: true, success: false });
  });

  it("prunes non-favorites to 500 while keeping favorites", async () => {
    const directory = await mkdtemp(join(tmpdir(), "netlas-state-")); directories.push(directory);
    const store = new StateStore(join(directory, "state.json")); await store.load();
    await store.addHistory(request("favorite"), true);
    await store.toggleFavorite(store.getHistory()[0]!.id);
    for (let index = 0; index < 505; index += 1) await store.addHistory(request(`host:${index}`), true);
    expect(store.getHistory().filter((entry) => !entry.favorite)).toHaveLength(500);
    expect(store.getHistory().some((entry) => entry.input === "favorite")).toBe(true);
  }, 20_000);
});

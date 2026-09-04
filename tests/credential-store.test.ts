import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CredentialStore, type SafeStorageAdapter } from "../src/desktop/credential-store";

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

const adapter = (backend = "kwallet5", available = true): SafeStorageAdapter => ({
  isEncryptionAvailable: () => available,
  getSelectedStorageBackend: () => backend,
  encryptString: (value) => Buffer.from(`encrypted:${value}`),
  decryptString: (value) => value.toString().replace("encrypted:", ""),
});

describe("CredentialStore", () => {
  it("round-trips an encrypted credential", async () => {
    const directory = await mkdtemp(join(tmpdir(), "netlas-key-")); directories.push(directory);
    const store = new CredentialStore(join(directory, "key"), adapter(), "linux");
    await store.save("secret");
    await expect(store.load()).resolves.toBe("secret");
  });

  it("refuses Linux basic_text storage", async () => {
    const directory = await mkdtemp(join(tmpdir(), "netlas-key-")); directories.push(directory);
    const store = new CredentialStore(join(directory, "key"), adapter("basic_text"), "linux");
    expect(store.availability().available).toBe(false);
    await expect(store.save("secret")).rejects.toThrow("error.secureStorage");
  });

  it("refuses unavailable encryption", async () => {
    const directory = await mkdtemp(join(tmpdir(), "netlas-key-")); directories.push(directory);
    const store = new CredentialStore(join(directory, "key"), adapter("kwallet5", false), "linux");
    await expect(store.load()).resolves.toBeUndefined();
  });
});

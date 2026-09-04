import { readFile, rm } from "node:fs/promises";
import { atomicWrite } from "./state-store";

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
  getSelectedStorageBackend?(): string;
}

export class CredentialStore {
  constructor(
    private readonly filePath: string,
    private readonly storage: SafeStorageAdapter,
    private readonly platform: NodeJS.Platform,
  ) {}

  availability(): { available: boolean; backend?: string } {
    const backend = this.platform === "linux" ? this.storage.getSelectedStorageBackend?.() : undefined;
    const available = this.storage.isEncryptionAvailable() && backend !== "basic_text";
    return { available, backend };
  }

  async load(): Promise<string | undefined> {
    if (!this.availability().available) return undefined;
    try {
      const encoded = (await readFile(this.filePath, "utf8")).trim();
      const value = this.storage.decryptString(Buffer.from(encoded, "base64")).trim();
      return value || undefined;
    } catch {
      return undefined;
    }
  }

  async save(apiKey: string): Promise<void> {
    if (!this.availability().available) throw new Error("error.secureStorage");
    const encrypted = this.storage.encryptString(apiKey.trim());
    await atomicWrite(this.filePath, encrypted.toString("base64"));
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}

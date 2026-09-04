import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { DEFAULT_BASE_URL, type AppSettings, type HistoryEntry, type QueryRequest } from "../core/types";
import { isLanguage } from "../core/validation";

interface StoredState {
  settings: AppSettings;
  history: HistoryEntry[];
}

const DEFAULT_STATE: StoredState = {
  settings: { baseUrl: DEFAULT_BASE_URL, rememberApiKey: false },
  history: [],
};

export class StateStore {
  private state: StoredState = structuredClone(DEFAULT_STATE);

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Partial<StoredState>;
      this.state = {
        settings: {
          baseUrl: typeof parsed.settings?.baseUrl === "string" ? parsed.settings.baseUrl : DEFAULT_BASE_URL,
          rememberApiKey: parsed.settings?.rememberApiKey === true,
          language: isLanguage(parsed.settings?.language) ? parsed.settings.language : undefined,
        },
        history: Array.isArray(parsed.history) ? parsed.history.filter(isHistoryEntry).sort(newestFirst) : [],
      };
      this.prune();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        const broken = `${this.filePath}.broken-${Date.now()}`;
        await rename(this.filePath, broken).catch(() => undefined);
      }
      this.state = structuredClone(DEFAULT_STATE);
    }
  }

  getSettings(): AppSettings {
    return { ...this.state.settings };
  }

  getHistory(): HistoryEntry[] {
    return this.state.history.map((entry) => ({ ...entry, options: { ...entry.options } }));
  }

  async setSettings(settings: AppSettings): Promise<void> {
    this.state.settings = { ...settings };
    await this.save();
  }

  async addHistory(request: QueryRequest, success: boolean): Promise<HistoryEntry> {
    const signature = historySignature(request.mode, request.input, request.options);
    const existingIndex = this.state.history.findIndex(
      (entry) => historySignature(entry.mode, entry.input, entry.options) === signature,
    );
    const existing = existingIndex >= 0 ? this.state.history.splice(existingIndex, 1)[0] : undefined;
    const entry: HistoryEntry = {
      id: existing?.id ?? randomUUID(),
      mode: request.mode,
      input: request.input,
      options: { ...request.options },
      createdAt: new Date().toISOString(),
      success,
      favorite: existing?.favorite ?? false,
    };
    this.state.history.unshift(entry);
    this.prune();
    await this.save();
    return entry;
  }

  async toggleFavorite(id: string): Promise<HistoryEntry[]> {
    const entry = this.state.history.find((item) => item.id === id);
    if (entry) entry.favorite = !entry.favorite;
    await this.save();
    return this.getHistory();
  }

  async deleteHistory(id: string): Promise<HistoryEntry[]> {
    this.state.history = this.state.history.filter((entry) => entry.id !== id);
    await this.save();
    return this.getHistory();
  }

  async clearHistory(includeFavorites: boolean): Promise<HistoryEntry[]> {
    this.state.history = includeFavorites ? [] : this.state.history.filter((entry) => entry.favorite);
    await this.save();
    return this.getHistory();
  }

  private prune(): void {
    let nonFavorites = 0;
    this.state.history = this.state.history.sort(newestFirst).filter((entry) => {
      if (entry.favorite) return true;
      nonFavorites += 1;
      return nonFavorites <= 500;
    });
  }

  private async save(): Promise<void> {
    await atomicWrite(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`);
  }
}

export async function atomicWrite(filePath: string, content: string | Buffer): Promise<void> {
  const directory = dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, `.${basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content);
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function newestFirst(left: HistoryEntry, right: HistoryEntry): number {
  return right.createdAt.localeCompare(left.createdAt);
}

function historySignature(mode: string, input: string, options: QueryRequest["options"]): string {
  return JSON.stringify([mode, input, options.limit ?? null, options.timeout, options.retries]);
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<HistoryEntry>;
  return typeof entry.id === "string"
    && (entry.mode === "host" || entry.mode === "search")
    && typeof entry.input === "string"
    && typeof entry.createdAt === "string"
    && typeof entry.success === "boolean"
    && typeof entry.favorite === "boolean"
    && !!entry.options
    && typeof entry.options.timeout === "number"
    && typeof entry.options.retries === "number";
}

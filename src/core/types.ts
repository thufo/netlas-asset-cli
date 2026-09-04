import packageJson from "../../package.json";

export const VERSION = packageJson.version;
export const DEFAULT_BASE_URL = "https://app.netlas.io";
export const DEFAULT_TIMEOUT_SECONDS = 30;
export const DEFAULT_RETRIES = 2;
export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_SEARCH_LIMIT = 200;

export type Language = "en" | "zh-CN" | "ru";
export type OutputFormat = "json" | "jsonl" | "csv";
export type QueryMode = "host" | "search";
export type JsonObject = Record<string, unknown>;

export interface QueryOptions {
  limit?: number;
  timeout: number;
  retries: number;
}

export interface QueryRequest {
  mode: QueryMode;
  input: string;
  options: QueryOptions;
}

export interface HistoryEntry {
  id: string;
  mode: QueryMode;
  input: string;
  options: QueryOptions;
  createdAt: string;
  success: boolean;
  favorite: boolean;
}

export interface AppSettings {
  language?: Language;
  baseUrl: string;
  rememberApiKey: boolean;
}

export interface AppState {
  language: Language;
  settings: AppSettings;
  history: HistoryEntry[];
  hasSessionApiKey: boolean;
  hasSavedApiKey: boolean;
  secureStorageAvailable: boolean;
  secureStorageWarning?: string;
  version: string;
  platform: NodeJS.Platform;
  arch: string;
  autoUpdateSupported: boolean;
}

export interface UpdateState {
  status: "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
  version?: string;
  percent?: number;
  message?: string;
  releaseUrl?: string;
  installable: boolean;
}

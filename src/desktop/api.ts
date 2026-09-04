import type { AppState, HistoryEntry, JsonObject, Language, OutputFormat, QueryRequest, UpdateState } from "../core/types";

export interface AppErrorPayload {
  key: string;
  values?: Record<string, string | number>;
}

export type QueryResult = { ok: true; data: JsonObject | JsonObject[] } | { ok: false; error: AppErrorPayload };
export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: AppErrorPayload };

export interface SaveSettingsInput {
  language: Language;
  baseUrl: string;
  rememberApiKey: boolean;
  apiKey?: string;
}

export interface DesktopApi {
  getState(): Promise<AppState>;
  setLanguage(language: Language): Promise<AppState>;
  saveSettings(input: SaveSettingsInput): Promise<ActionResult<AppState>>;
  runQuery(request: QueryRequest): Promise<QueryResult>;
  cancelQuery(): Promise<void>;
  exportResult(format: OutputFormat, data: JsonObject | JsonObject[]): Promise<ActionResult<string | undefined>>;
  toggleFavorite(id: string): Promise<HistoryEntry[]>;
  deleteHistory(id: string): Promise<HistoryEntry[]>;
  clearHistory(includeFavorites: boolean): Promise<HistoryEntry[]>;
  checkForUpdates(): Promise<UpdateState>;
  downloadUpdate(): Promise<UpdateState>;
  installUpdate(): Promise<void>;
  openRelease(): Promise<void>;
  onUpdateState(callback: (state: UpdateState) => void): () => void;
}

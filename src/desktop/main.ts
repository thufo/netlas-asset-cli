import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, safeStorage } from "electron";
import { NetlasClient, NetlasError } from "../core/client";
import { resolveLanguage } from "../core/i18n";
import { renderOutput, writeOutputAtomic } from "../core/output";
import {
  DEFAULT_SEARCH_LIMIT,
  VERSION,
  type AppState,
  type JsonObject,
  type QueryRequest,
} from "../core/types";
import {
  isLanguage,
  isOutputFormat,
  validateBaseUrl,
  validateLimit,
  validateQuery,
  validateRetries,
  validateTarget,
  validateTimeout,
} from "../core/validation";
import type { ActionResult, AppErrorPayload, QueryResult, SaveSettingsInput } from "./api";
import { CredentialStore } from "./credential-store";
import { StateStore } from "./state-store";
import { UpdateService } from "./update-service";

let mainWindow: BrowserWindow | undefined;
let stateStore: StateStore;
let credentialStore: CredentialStore;
let updateService: UpdateService;
let sessionApiKey: string | undefined;
let activeQuery: AbortController | undefined;

app.setName("Netlas Asset");

void app.whenReady().then(async () => {
  const userData = app.getPath("userData");
  stateStore = new StateStore(join(userData, "state.json"));
  credentialStore = new CredentialStore(join(userData, "credentials.dat"), safeStorage, process.platform);
  await stateStore.load();
  if (stateStore.getSettings().rememberApiKey) sessionApiKey = await credentialStore.load();
  updateService = new UpdateService((state) => mainWindow?.webContents.send("update:state", state));
  registerIpc();
  createWindow();
  setTimeout(() => void updateService.check(), 10_000);
});

app.on("window-all-closed", () => {
  sessionApiKey = undefined;
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 800,
    minWidth: 920,
    minHeight: 620,
    backgroundColor: "#f4f7fb",
    title: "Netlas Asset",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.removeMenu();
  mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  if (process.argv.includes("--smoke-test")) {
    mainWindow.webContents.once("did-finish-load", () => setTimeout(() => app.quit(), 200));
  }
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.on("closed", () => { mainWindow = undefined; });
}

function registerIpc(): void {
  ipcMain.handle("app:get-state", () => buildState());
  ipcMain.handle("app:set-language", async (_event, value: unknown) => {
    if (!isLanguage(value)) return buildState();
    await stateStore.setSettings({ ...stateStore.getSettings(), language: value });
    return buildState();
  });
  ipcMain.handle("settings:save", async (_event, input: SaveSettingsInput): Promise<ActionResult<AppState>> => {
    try {
      if (!isLanguage(input.language)) throw new Error("error.baseUrlInvalid");
      const baseUrl = validateBaseUrl(input.baseUrl);
      const newKey = input.apiKey?.trim();
      if (newKey) sessionApiKey = newKey;
      const availability = credentialStore.availability();
      let rememberApiKey = input.rememberApiKey;
      if (rememberApiKey && !sessionApiKey) throw new NetlasError("validation", "error.apiKeyMissing");
      if (rememberApiKey && !availability.available) rememberApiKey = false;
      if (rememberApiKey && sessionApiKey) await credentialStore.save(sessionApiKey);
      if (!rememberApiKey) await credentialStore.clear();
      await stateStore.setSettings({ language: input.language, baseUrl, rememberApiKey });
      return { ok: true, value: buildState() };
    } catch (error) {
      return { ok: false, error: errorPayload(error) };
    }
  });
  ipcMain.handle("query:run", async (_event, raw: QueryRequest): Promise<QueryResult> => {
    let request: QueryRequest;
    try {
      request = validateRequest(raw);
      if (!sessionApiKey) throw new NetlasError("validation", "error.apiKeyMissing");
    } catch (error) {
      return { ok: false, error: errorPayload(error) };
    }

    activeQuery?.abort();
    activeQuery = new AbortController();
    try {
      const settings = stateStore.getSettings();
      const client = new NetlasClient({
        apiKey: sessionApiKey,
        baseUrl: settings.baseUrl,
        timeoutSeconds: request.options.timeout,
        maxRetries: request.options.retries,
      });
      const data = request.mode === "host"
        ? await client.hostSummary(request.input, activeQuery.signal)
        : await client.searchResponses(request.input, request.options.limit ?? DEFAULT_SEARCH_LIMIT, activeQuery.signal);
      await stateStore.addHistory(request, true);
      return { ok: true, data };
    } catch (error) {
      await stateStore.addHistory(request, false);
      return { ok: false, error: errorPayload(error) };
    } finally {
      activeQuery = undefined;
    }
  });
  ipcMain.handle("query:cancel", () => activeQuery?.abort(new Error("cancelled")));
  ipcMain.handle("result:export", async (_event, input: { format: unknown; data: JsonObject | JsonObject[] }): Promise<ActionResult<string | undefined>> => {
    try {
      if (!isOutputFormat(input.format)) throw new Error("error.format");
      const selected = await dialog.showSaveDialog(mainWindow!, {
        title: "Export Netlas results",
        defaultPath: `netlas-results.${input.format === "jsonl" ? "jsonl" : input.format}`,
        filters: [{ name: input.format.toUpperCase(), extensions: [input.format] }],
      });
      if (selected.canceled || !selected.filePath) return { ok: true, value: undefined };
      await writeOutputAtomic(selected.filePath, renderOutput(input.data, input.format));
      return { ok: true, value: selected.filePath };
    } catch (error) {
      return { ok: false, error: errorPayload(error) };
    }
  });
  ipcMain.handle("history:favorite", (_event, id: string) => stateStore.toggleFavorite(String(id)));
  ipcMain.handle("history:delete", (_event, id: string) => stateStore.deleteHistory(String(id)));
  ipcMain.handle("history:clear", (_event, includeFavorites: boolean) => stateStore.clearHistory(includeFavorites === true));
  ipcMain.handle("update:check", () => updateService.check());
  ipcMain.handle("update:download", () => updateService.download());
  ipcMain.handle("update:install", () => updateService.install());
  ipcMain.handle("update:open-release", () => updateService.openRelease());
}

function buildState(): AppState {
  const settings = stateStore.getSettings();
  const availability = credentialStore.availability();
  return {
    language: settings.language ?? resolveLanguage(app.getLocale()),
    settings,
    history: stateStore.getHistory(),
    hasSessionApiKey: Boolean(sessionApiKey),
    hasSavedApiKey: settings.rememberApiKey && Boolean(sessionApiKey),
    secureStorageAvailable: availability.available,
    secureStorageWarning: availability.available ? undefined : availability.backend,
    version: app.getVersion() || VERSION,
    platform: process.platform,
    arch: process.arch,
    autoUpdateSupported: updateService.getState().installable,
  };
}

function validateRequest(raw: QueryRequest): QueryRequest {
  if (!raw || (raw.mode !== "host" && raw.mode !== "search")) throw new Error("error.queryRequired");
  const input = raw.mode === "host" ? validateTarget(raw.input) : validateQuery(raw.input);
  const timeout = validateTimeout(Number(raw.options?.timeout));
  const retries = validateRetries(Number(raw.options?.retries));
  const limit = raw.mode === "search" ? validateLimit(Number(raw.options?.limit ?? DEFAULT_SEARCH_LIMIT)) : undefined;
  return { mode: raw.mode, input, options: { timeout, retries, limit } };
}

function errorPayload(error: unknown): AppErrorPayload {
  if (error instanceof NetlasError) return { key: error.translationKey, values: error.values };
  if (error instanceof Error && error.message.startsWith("error.")) return { key: error.message };
  return { key: "common.error", values: { reason: error instanceof Error ? error.message : String(error) } };
}

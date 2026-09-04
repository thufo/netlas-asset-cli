import "./style.css";
import { translate, translationKeys, type TranslationKey } from "../../core/i18n";
import type {
  AppState,
  HistoryEntry,
  JsonObject,
  Language,
  OutputFormat,
  QueryMode,
  QueryRequest,
  UpdateState,
} from "../../core/types";
import type { AppErrorPayload } from "../api";

const element = <T extends HTMLElement>(id: string): T => {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing element: ${id}`);
  return value as T;
};

let state: AppState;
let language: Language = "en";
let mode: QueryMode = "host";
let result: JsonObject | JsonObject[] | undefined;
let resultView: "table" | "json" = "table";
let updateState: UpdateState = { status: "idle", installable: false };
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const queryForm = element<HTMLFormElement>("query-form");
const queryInput = element<HTMLInputElement>("query-input");
const queryLimit = element<HTMLInputElement>("query-limit");
const queryTimeout = element<HTMLInputElement>("query-timeout");
const queryRetries = element<HTMLInputElement>("query-retries");
const runButton = element<HTMLButtonElement>("run-query");
const cancelButton = element<HTMLButtonElement>("cancel-query");
const exportButton = element<HTMLButtonElement>("export-result");
const exportFormat = element<HTMLSelectElement>("export-format");
const settingsForm = element<HTMLFormElement>("settings-form");
const apiKeyInput = element<HTMLInputElement>("settings-api-key");
const baseUrlInput = element<HTMLInputElement>("settings-base-url");
const rememberInput = element<HTMLInputElement>("settings-remember");
const settingsLanguage = element<HTMLSelectElement>("settings-language");
const quickLanguage = element<HTMLSelectElement>("quick-language");

void initialize();

async function initialize(): Promise<void> {
  state = await window.netlas.getState();
  language = state.language;
  updateState = { status: "idle", installable: state.autoUpdateSupported };
  bindEvents();
  applyLanguage();
  renderSettings();
  renderHistory();
  renderAbout();
  renderResult();
  updateConnectionState();
  window.netlas.onUpdateState((next) => {
    updateState = next;
    renderUpdate();
  });
}

function bindEvents(): void {
  document.querySelectorAll<HTMLButtonElement>(".nav-item").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.view || "lookup"));
  });
  document.querySelectorAll<HTMLButtonElement>(".mode-tab").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode === "search" ? "search" : "host"));
  });
  document.querySelectorAll<HTMLButtonElement>(".result-view").forEach((button) => {
    button.addEventListener("click", () => {
      resultView = button.dataset.resultView === "json" ? "json" : "table";
      renderResult();
    });
  });
  queryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void runQuery();
  });
  cancelButton.addEventListener("click", () => void window.netlas.cancelQuery());
  exportButton.addEventListener("click", () => void exportResults());
  quickLanguage.addEventListener("change", () => void changeLanguage(quickLanguage.value as Language));
  settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveSettings();
  });
  element("clear-history").addEventListener("click", () => void clearHistory(false));
  element("clear-all-history").addEventListener("click", () => void clearHistory(true));
  element("check-update").addEventListener("click", () => void window.netlas.checkForUpdates());
  element("download-update").addEventListener("click", () => void window.netlas.downloadUpdate());
  element("install-update").addEventListener("click", () => void window.netlas.installUpdate());
  element("open-release").addEventListener("click", () => void window.netlas.openRelease());
}

function t(key: TranslationKey, values?: Record<string, string | number>): string {
  return translate(language, key, values);
}

function applyLanguage(): void {
  document.documentElement.lang = language;
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((node) => {
    const key = node.dataset.i18n as TranslationKey;
    if (translationKeys.includes(key)) node.textContent = t(key);
  });
  queryInput.placeholder = t(mode === "host" ? "lookup.placeholderHost" : "lookup.placeholderSearch");
  apiKeyInput.placeholder = t("settings.apiKeyPlaceholder");
  quickLanguage.value = language;
  settingsLanguage.value = language;
  renderResult();
  renderHistory();
  renderAbout();
}

async function changeLanguage(next: Language): Promise<void> {
  state = await window.netlas.setLanguage(next);
  language = state.language;
  applyLanguage();
}

function navigate(view: string): void {
  document.querySelectorAll(".view").forEach((node) => node.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((node) => node.classList.remove("active"));
  document.getElementById(`view-${view}`)?.classList.add("active");
  document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add("active");
  if (view === "history") renderHistory();
}

function setMode(next: QueryMode): void {
  mode = next;
  document.querySelectorAll(".mode-tab").forEach((node) => node.classList.toggle("active", (node as HTMLElement).dataset.mode === mode));
  element("limit-field").classList.toggle("hidden", mode !== "search");
  element("query-label").textContent = t(mode === "host" ? "lookup.target" : "lookup.query");
  queryInput.placeholder = t(mode === "host" ? "lookup.placeholderHost" : "lookup.placeholderSearch");
}

async function runQuery(): Promise<void> {
  const request: QueryRequest = {
    mode,
    input: queryInput.value,
    options: {
      limit: mode === "search" ? Number(queryLimit.value) : undefined,
      timeout: Number(queryTimeout.value),
      retries: Number(queryRetries.value),
    },
  };
  setBusy(true);
  setStatus(t("lookup.running"));
  const response = await window.netlas.runQuery(request);
  setBusy(false);
  state = await window.netlas.getState();
  updateConnectionState();
  if (response.ok) {
    result = response.data;
    setStatus("", "success");
    renderResult();
  } else {
    setStatus(errorText(response.error), "error");
  }
}

function setBusy(busy: boolean): void {
  runButton.disabled = busy;
  cancelButton.classList.toggle("hidden", !busy);
  queryInput.disabled = busy;
}

function setStatus(message: string, type: "normal" | "error" | "success" = "normal"): void {
  const status = element("query-status");
  status.textContent = message;
  status.className = message ? `status${type === "normal" ? "" : ` ${type}`}` : "status hidden";
}

function renderResult(): void {
  const empty = element("empty-result");
  const table = element("table-result");
  const json = element("json-result");
  document.querySelectorAll(".result-view").forEach((node) => node.classList.toggle("active", (node as HTMLElement).dataset.resultView === resultView));
  exportButton.disabled = result === undefined;
  if (result === undefined) {
    empty.classList.remove("hidden"); table.classList.add("hidden"); json.classList.add("hidden");
    element("result-count").textContent = "";
    return;
  }
  const records = Array.isArray(result) ? result : [result];
  element("result-count").textContent = t("lookup.resultCount", { count: records.length });
  if (resultView === "json") {
    empty.classList.add("hidden"); table.classList.add("hidden"); json.classList.remove("hidden");
    json.textContent = JSON.stringify(result, null, 2);
    return;
  }
  json.classList.add("hidden");
  if (records.length === 0) {
    empty.classList.remove("hidden"); table.classList.add("hidden");
    return;
  }
  empty.classList.add("hidden"); table.classList.remove("hidden");
  table.replaceChildren(buildTable(records));
}

function buildTable(records: JsonObject[]): HTMLTableElement {
  const columns = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const table = document.createElement("table");
  const head = table.createTHead().insertRow();
  for (const column of columns) {
    const cell = document.createElement("th"); cell.textContent = column; head.append(cell);
  }
  const body = table.createTBody();
  for (const record of records) {
    const row = body.insertRow();
    for (const column of columns) {
      const cell = row.insertCell();
      const value = record[column];
      cell.textContent = value !== null && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
      cell.title = cell.textContent;
    }
  }
  return table;
}

async function exportResults(): Promise<void> {
  if (result === undefined) return;
  const response = await window.netlas.exportResult(exportFormat.value as OutputFormat, result);
  if (!response.ok) showToast(errorText(response.error), true);
  else showToast(t(response.value ? "lookup.exported" : "lookup.exportCancelled"));
}

function renderHistory(): void {
  if (!state) return;
  const list = element("history-list");
  list.replaceChildren();
  if (state.history.length === 0) {
    const empty = document.createElement("div"); empty.className = "panel empty-history"; empty.textContent = t("history.empty"); list.append(empty); return;
  }
  for (const entry of state.history) list.append(historyCard(entry));
}

function historyCard(entry: HistoryEntry): HTMLElement {
  const card = document.createElement("article");
  card.className = `history-card${entry.favorite ? " favorite" : ""}`;
  const badge = document.createElement("span"); badge.className = "history-mode"; badge.textContent = entry.mode;
  const main = document.createElement("div"); main.className = "history-main";
  const input = document.createElement("div"); input.className = "history-input"; input.textContent = entry.input; input.title = entry.input;
  const meta = document.createElement("div"); meta.className = "history-meta";
  meta.textContent = `${new Date(entry.createdAt).toLocaleString(language)} · ${t(entry.success ? "history.success" : "history.failed")} · ${entry.options.timeout}s · ${entry.options.retries}×`;
  main.append(input, meta);
  const actions = document.createElement("div"); actions.className = "history-actions";
  actions.append(
    actionButton("↻", t("history.rerun"), () => rerun(entry)),
    actionButton(entry.favorite ? "★" : "☆", t(entry.favorite ? "history.unfavorite" : "history.favorite"), () => void toggleFavorite(entry.id)),
    actionButton("×", t("history.delete"), () => void deleteHistory(entry.id)),
  );
  card.append(badge, main, actions);
  return card;
}

function actionButton(label: string, title: string, callback: () => void): HTMLButtonElement {
  const button = document.createElement("button"); button.className = "icon-button"; button.textContent = label; button.title = title; button.addEventListener("click", callback); return button;
}

function rerun(entry: HistoryEntry): void {
  setMode(entry.mode); queryInput.value = entry.input; queryTimeout.value = String(entry.options.timeout); queryRetries.value = String(entry.options.retries);
  if (entry.options.limit) queryLimit.value = String(entry.options.limit);
  navigate("lookup"); void runQuery();
}

async function toggleFavorite(id: string): Promise<void> { state.history = await window.netlas.toggleFavorite(id); renderHistory(); }
async function deleteHistory(id: string): Promise<void> { state.history = await window.netlas.deleteHistory(id); renderHistory(); }
async function clearHistory(includeFavorites: boolean): Promise<void> {
  if (includeFavorites && !window.confirm(t("history.clearAll"))) return;
  state.history = await window.netlas.clearHistory(includeFavorites); renderHistory();
}

function renderSettings(): void {
  baseUrlInput.value = state.settings.baseUrl;
  rememberInput.checked = state.settings.rememberApiKey;
  rememberInput.disabled = !state.secureStorageAvailable;
  settingsLanguage.value = language;
  element("saved-key-note").classList.toggle("hidden", !state.hasSavedApiKey);
  element("secure-warning").classList.toggle("hidden", state.secureStorageAvailable);
}

async function saveSettings(): Promise<void> {
  const response = await window.netlas.saveSettings({
    language: settingsLanguage.value as Language,
    baseUrl: baseUrlInput.value,
    rememberApiKey: rememberInput.checked,
    apiKey: apiKeyInput.value || undefined,
  });
  if (!response.ok) { showToast(errorText(response.error), true); return; }
  state = response.value; language = state.language; apiKeyInput.value = ""; applyLanguage(); renderSettings(); updateConnectionState(); showToast(t("settings.saved"));
}

function updateConnectionState(): void {
  element("connection-state").classList.toggle("ready", state.hasSessionApiKey);
}

function renderAbout(): void {
  if (!state) return;
  element("about-version").textContent = t("about.version", { version: state.version });
  element("about-platform").textContent = t("about.platform", { platform: state.platform, arch: state.arch });
  renderUpdate();
}

function renderUpdate(): void {
  const message = element("update-message");
  const check = element("check-update");
  const download = element("download-update");
  const install = element("install-update");
  const release = element("open-release");
  check.classList.toggle("hidden", updateState.status === "checking" || updateState.status === "downloading");
  download.classList.add("hidden"); install.classList.add("hidden"); release.classList.add("hidden");
  switch (updateState.status) {
    case "checking": message.textContent = t("about.updateChecking"); break;
    case "available":
      message.textContent = t("about.updateAvailable", { version: updateState.version || "" });
      (updateState.installable ? download : release).classList.remove("hidden"); break;
    case "not-available": message.textContent = t("about.updateCurrent"); break;
    case "downloading": message.textContent = t("about.updateDownloading", { percent: updateState.percent ?? 0 }); break;
    case "downloaded": message.textContent = t("about.updateReady"); install.classList.remove("hidden"); break;
    case "error": message.textContent = t("error.update", { reason: updateState.message || t("common.unknown") }); break;
    default: message.textContent = state?.autoUpdateSupported ? "" : t("about.updateUnsupported");
  }
}

function errorText(error: AppErrorPayload): string {
  const key = error.key as TranslationKey;
  return translationKeys.includes(key) ? t(key, error.values) : `${t("common.error")}: ${error.key}`;
}

function showToast(message: string, isError = false): void {
  const toast = element("toast");
  toast.textContent = message; toast.className = `toast${isError ? " error" : ""}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 3500);
}

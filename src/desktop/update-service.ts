import { app, shell } from "electron";
import { autoUpdater, type UpdateInfo } from "electron-updater";
import type { UpdateState } from "../core/types";

const RELEASES_URL = "https://github.com/thufo/netlas-asset-cli/releases/latest";
const RELEASES_API = "https://api.github.com/repos/thufo/netlas-asset-cli/releases/latest";

export class UpdateService {
  private state: UpdateState;
  private releaseUrl = RELEASES_URL;

  constructor(private readonly publish: (state: UpdateState) => void) {
    const installable = app.isPackaged && ((process.platform === "win32" && !process.env.PORTABLE_EXECUTABLE_FILE)
      || (process.platform === "linux" && Boolean(process.env.APPIMAGE)));
    this.state = { status: "idle", installable };
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.channel = `latest-${process.platform}-${process.arch}`;
    autoUpdater.on("checking-for-update", () => this.set({ status: "checking" }));
    autoUpdater.on("update-available", (info) => this.onAvailable(info));
    autoUpdater.on("update-not-available", () => this.set({ status: "not-available" }));
    autoUpdater.on("download-progress", (progress) => this.set({ status: "downloading", percent: Math.round(progress.percent) }));
    autoUpdater.on("update-downloaded", (info) => this.set({ status: "downloaded", version: info.version }));
    autoUpdater.on("error", (error) => this.set({ status: "error", message: error.message }));
  }

  getState(): UpdateState {
    return { ...this.state };
  }

  async check(): Promise<UpdateState> {
    this.set({ status: "checking" });
    try {
      if (app.isPackaged && this.state.installable) {
        await autoUpdater.checkForUpdates();
      } else {
        await this.checkGitHubRelease();
      }
    } catch (error) {
      this.set({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
    return this.getState();
  }

  async download(): Promise<UpdateState> {
    if (!this.state.installable) {
      await this.openRelease();
      return this.getState();
    }
    this.set({ status: "downloading", percent: 0 });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.set({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
    return this.getState();
  }

  install(): void {
    if (this.state.status === "downloaded" && this.state.installable) autoUpdater.quitAndInstall(false, true);
  }

  async openRelease(): Promise<void> {
    await shell.openExternal(this.releaseUrl);
  }

  private onAvailable(info: UpdateInfo): void {
    this.set({ status: "available", version: info.version, releaseUrl: this.releaseUrl });
  }

  private async checkGitHubRelease(): Promise<void> {
    const response = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
    if (response.status === 404) {
      this.set({ status: "not-available" });
      return;
    }
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
    const release = await response.json() as { tag_name?: string; html_url?: string };
    const version = (release.tag_name ?? "").replace(/^v/, "");
    this.releaseUrl = release.html_url || RELEASES_URL;
    if (version && compareVersions(version, app.getVersion()) > 0) {
      this.set({ status: "available", version, releaseUrl: this.releaseUrl });
    } else {
      this.set({ status: "not-available" });
    }
  }

  private set(update: Partial<UpdateState>): void {
    this.state = { ...this.state, ...update };
    this.publish(this.getState());
  }
}

export function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) > (b[index] ?? 0) ? 1 : -1;
  }
  return 0;
}

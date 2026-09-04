import type { DesktopApi } from "../api";

declare global {
  interface Window { netlas: DesktopApi; }
}

export {};

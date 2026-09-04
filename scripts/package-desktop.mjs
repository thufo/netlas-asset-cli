import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const builder = join(dirname(require.resolve("electron-builder/package.json")), "out", "cli", "cli.js");
const platform = process.env.BUILD_PLATFORM || process.platform;
const arch = process.env.BUILD_ARCH || process.arch;

if (!['win32', 'linux'].includes(platform)) throw new Error(`Unsupported desktop platform: ${platform}`);
if (!['x64', 'arm64'].includes(arch)) throw new Error(`Unsupported desktop architecture: ${arch}`);

const platformFlag = platform === "win32" ? "--win" : "--linux";
execFileSync(process.execPath, [builder, "--config", "electron-builder.config.cjs", platformFlag, `--${arch}`, ...process.argv.slice(2)], {
  stdio: "inherit",
});

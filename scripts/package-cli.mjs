import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkg = join(dirname(require.resolve("@yao-pkg/pkg")), "bin.js");
const { version } = require("../package.json");
const platform = process.env.BUILD_PLATFORM || process.platform;
const arch = process.env.BUILD_ARCH || process.arch;
const pkgPlatform = platform === "win32" ? "win" : platform;
const extension = platform === "win32" ? ".exe" : "";
const platformName = platform === "win32" ? "windows" : platform;
const output = `release/cli/netlas-asset-cli-${version}-${platformName}-${arch}${extension}`;

await mkdir("release/cli", { recursive: true });
execFileSync(process.execPath, [pkg, "--sea", "dist/cli/netlas-asset.cjs", "--target", `node22.23.2-${pkgPlatform}-${arch}`, "--output", output], {
  stdio: "inherit",
});

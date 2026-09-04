import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.argv[2] || "release";
const files = [];

async function walk(directory) {
  for (const name of await readdir(directory)) {
    if (name === "SHA256SUMS.txt") continue;
    const path = join(directory, name);
    const info = await stat(path);
    if (info.isDirectory()) await walk(path);
    else files.push(path);
  }
}

await walk(root);
files.sort();
const lines = [];
for (const file of files) {
  const digest = createHash("sha256").update(await readFile(file)).digest("hex");
  lines.push(`${digest}  ${relative(root, file).replaceAll("\\", "/")}`);
}
await writeFile(join(root, "SHA256SUMS.txt"), `${lines.join("\n")}\n`, "utf8");

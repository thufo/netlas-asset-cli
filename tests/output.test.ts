import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderOutput, writeOutputAtomic } from "../src/core/output";

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("output", () => {
  it("renders JSON and JSONL without escaping Unicode", () => {
    expect(renderOutput({ name: "测试" }, "json")).toContain("测试");
    expect(renderOutput([{ id: 1 }, { id: 2 }], "jsonl")).toBe('{"id":1}\n{"id":2}\n');
  });

  it("renders CSV using the union of keys and encodes nested values", () => {
    const csv = renderOutput([{ host: "a", ports: [80, 443] }, { host: "b", note: "a,b" }], "csv");
    expect(csv).toContain("host,ports,note");
    expect(csv).toContain('"[80,443]"');
    expect(csv).toContain('"a,b"');
  });

  it("atomically replaces an existing file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "netlas-output-")); directories.push(directory);
    const path = join(directory, "result.json");
    await writeFile(path, "old", "utf8");
    await writeOutputAtomic(path, "new");
    expect(await readFile(path, "utf8")).toBe("new");
  });
});

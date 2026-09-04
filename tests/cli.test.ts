import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli, type CliIo } from "../src/cli/cli";

function capturedIo(): { io: CliIo; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: { write: (value) => stdout.push(value) },
      stderr: { write: (value) => stderr.push(value) },
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("CLI", () => {
  it("localizes help in Simplified Chinese", async () => {
    const output = capturedIo();
    expect(await runCli(["--lang", "zh-CN", "--help"], {}, output.io)).toBe(0);
    expect(output.stdout.join("")).toContain("用法：");
    expect(output.stdout.join("")).toContain("命令：");
  });

  it("localizes missing-key errors in Russian", async () => {
    const output = capturedIo();
    expect(await runCli(["host", "example.com", "--lang", "ru"], {}, output.io)).toBe(1);
    expect(output.stderr.join("")).toContain("Сначала укажите ключ API");
  });

  it("keeps machine-readable JSON fields unchanged", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ domain: "example.com" }))));
    const output = capturedIo();
    expect(await runCli(["--lang", "zh-CN", "host", "example.com"], { NETLAS_API_KEY: "secret" }, output.io)).toBe(0);
    expect(JSON.parse(output.stdout.join(""))).toEqual({ domain: "example.com" });
  });

  it("validates numeric options before checking credentials", async () => {
    const output = capturedIo();
    expect(await runCli(["--lang", "zh-CN", "host", "example.com", "--timeout", "0"], {}, output.io)).toBe(1);
    expect(output.stderr.join("")).toContain("超时时间必须");
  });
});

import { Command, CommanderError, Option } from "commander";
import { NetlasClient, NetlasError } from "../core/client";
import { resolveLanguage, translate, type TranslationKey } from "../core/i18n";
import { renderOutput, writeOutputAtomic } from "../core/output";
import {
  DEFAULT_BASE_URL,
  DEFAULT_RETRIES,
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_TIMEOUT_SECONDS,
  VERSION,
  type Language,
  type OutputFormat,
} from "../core/types";
import { isLanguage, isOutputFormat, validateLimit, validateQuery, validateRetries, validateTarget, validateTimeout } from "../core/validation";

export interface CliIo {
  stdout: { write(value: string): unknown };
  stderr: { write(value: string): unknown };
}

export interface CliEnvironment {
  [key: string]: string | undefined;
}

interface CommonOptions {
  timeout: number;
  retries: number;
  format: OutputFormat;
  output?: string;
}

export async function runCli(
  argv: string[],
  environment: CliEnvironment = process.env,
  io: CliIo = process,
): Promise<number> {
  const language = languageFromArguments(argv, environment);
  const t = (key: TranslationKey, values?: Record<string, string | number>) => translate(language, key, values);
  const requestedLanguage = rawLanguageArgument(argv);
  if (requestedLanguage !== undefined && !isLanguage(requestedLanguage)) {
    io.stderr.write(`${t("cli.errorPrefix")}: ${t("error.languageInvalid")}\n`);
    return 1;
  }
  const program = new Command();

  program
    .name("netlas-asset")
    .description(t("cli.description"))
    .version(VERSION, "-V, --version", t("cli.versionDescription"))
    .helpOption("-h, --help", t("cli.helpDescription"))
    .helpCommand("help [command]", t("cli.helpCommandDescription"))
    .addOption(new Option("--lang <language>", t("cli.langDescription")));
  const titles: Record<string, string> = {
    "Usage:": t("cli.usageTitle"),
    "Arguments:": t("cli.argumentsTitle"),
    "Options:": t("cli.optionsTitle"),
    "Global Options:": t("cli.globalOptionsTitle"),
    "Commands:": t("cli.commandsTitle"),
  };
  program.configureHelp({ styleTitle: (title) => titles[title] ?? title });
  program.exitOverride();
  program.configureOutput({
    writeOut: (value) => io.stdout.write(value),
    writeErr: (value) => io.stderr.write(value),
    outputError: (value, write) => write(value.replace(/^error:/, `${t("cli.errorPrefix")}:`)),
  });

  const run = async (mode: "host" | "search", input: string, options: CommonOptions & { limit?: number }) => {
    try {
      validateTimeout(options.timeout);
      validateRetries(options.retries);
      input = mode === "host" ? validateTarget(input) : validateQuery(input);
      if (mode === "search") validateLimit(options.limit ?? DEFAULT_SEARCH_LIMIT);
    } catch (error) {
      throw new NetlasError("validation", (error as Error).message);
    }
    const apiKey = (environment.NETLAS_API_KEY ?? "").trim();
    if (!apiKey) throw new NetlasError("validation", "error.apiKeyMissing");
    const client = new NetlasClient({
      apiKey,
      baseUrl: environment.NETLAS_BASE_URL || DEFAULT_BASE_URL,
      timeoutSeconds: options.timeout,
      maxRetries: options.retries,
    });
    const result = mode === "host"
      ? await client.hostSummary(input)
      : await client.searchResponses(input, options.limit ?? DEFAULT_SEARCH_LIMIT);
    const output = renderOutput(result, options.format);
    if (options.output) await writeOutputAtomic(options.output, output);
    else io.stdout.write(output);
  };

  program
    .command("host")
    .description(t("cli.hostDescription"))
    .argument("<target>", t("cli.targetDescription"))
    .addOption(numberOption("--timeout <seconds>", t("cli.timeoutDescription"), DEFAULT_TIMEOUT_SECONDS))
    .addOption(numberOption("--retries <count>", t("cli.retriesDescription"), DEFAULT_RETRIES))
    .addOption(new Option("--format <format>", t("cli.formatDescription")).choices(["json", "jsonl", "csv"]).default("json"))
    .option("--output <path>", t("cli.outputDescription"))
    .action(async (target: string, options: CommonOptions) => run("host", target, options));

  program
    .command("search")
    .description(t("cli.searchDescription"))
    .argument("<query>", t("cli.queryDescription"))
    .addOption(numberOption("--limit <count>", t("cli.limitDescription"), DEFAULT_SEARCH_LIMIT))
    .addOption(numberOption("--timeout <seconds>", t("cli.timeoutDescription"), DEFAULT_TIMEOUT_SECONDS))
    .addOption(numberOption("--retries <count>", t("cli.retriesDescription"), DEFAULT_RETRIES))
    .addOption(new Option("--format <format>", t("cli.formatDescription")).choices(["json", "jsonl", "csv"]).default("json"))
    .option("--output <path>", t("cli.outputDescription"))
    .action(async (query: string, options: CommonOptions & { limit: number }) => run("search", query, options));

  try {
    await program.parseAsync(["node", "netlas-asset", ...argv]);
    return 0;
  } catch (error) {
    if (error instanceof CommanderError && ["commander.helpDisplayed", "commander.version"].includes(error.code)) return 0;
    if (error instanceof CommanderError) return error.exitCode || 1;
    const message = localizedError(error, language);
    io.stderr.write(`${t("cli.errorPrefix")}: ${message}\n`);
    return 1;
  }
}

function numberOption(
  flags: string,
  description: string,
  defaultValue: number,
): Option {
  return new Option(flags, description).argParser((raw) => Number(raw)).default(defaultValue);
}

function languageFromArguments(argv: string[], environment: CliEnvironment): Language {
  const requested = rawLanguageArgument(argv);
  if (isLanguage(requested)) return requested;
  return resolveLanguage(environment.LC_ALL || environment.LC_MESSAGES || environment.LANG || Intl.DateTimeFormat().resolvedOptions().locale);
}

function rawLanguageArgument(argv: string[]): string | undefined {
  const index = argv.findIndex((value) => value === "--lang");
  if (index >= 0) return argv[index + 1] ?? "";
  return argv.find((value) => value.startsWith("--lang="))?.slice("--lang=".length);
}

function localizedError(error: unknown, language: Language): string {
  if (error instanceof NetlasError) return translate(language, error.translationKey as TranslationKey, error.values);
  if (error instanceof Error && error.message.startsWith("error.")) return translate(language, error.message as TranslationKey);
  return error instanceof Error ? error.message : String(error);
}

export function parseOutputFormat(value: unknown): OutputFormat {
  if (!isOutputFormat(value)) throw new Error("error.format");
  return value;
}

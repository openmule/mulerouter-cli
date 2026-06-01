import { VERSION } from "@mulerouter/core";
import { Command } from "commander";
import { executeConfig } from "./commands/config.js";
import { executeList } from "./commands/list.js";
import { executeParams } from "./commands/params.js";
import { executeRun } from "./commands/run.js";
import { executeStatus } from "./commands/status.js";

const program = new Command();

program
  .name("mulerouter")
  .description("CLI for MuleRouter/MuleRun multimodal AI APIs")
  .version(VERSION);

// ── list ──────────────────────────────────────────────────────────
program
  .command("list")
  .description("List available models")
  .option("--provider <name>", "filter by provider (e.g., alibaba, google)")
  .option("--output-type <type>", "filter by output type (image, video, audio)", undefined)
  .option("--tag <tag>", "filter by tag (e.g., SOTA)")
  .option("--site <site>", "filter by site (mulerouter, mulerun)")
  .option("--json", "output as JSON")
  .option("--providers", "list providers only")
  .action((options) => {
    executeList({
      provider: options.provider,
      outputType: options.outputType,
      tag: options.tag,
      site: options.site,
      json: options.json,
      providers: options.providers,
    });
  });

// ── params ────────────────────────────────────────────────────────
program
  .command("params <endpoint>")
  .description("Show parameters for a model endpoint")
  .addHelpText(
    "after",
    `
Examples:
  $ mulerouter params alibaba/wan2.6-t2v
  $ mulerouter params google/nano-banana-2/edit
  $ mulerouter params midjourney/diffusion --json`,
  )
  .option("--json", "output as JSON")
  .action((endpoint, options) => {
    executeParams(endpoint, { json: options.json });
  });

// ── run ───────────────────────────────────────────────────────────
program
  .command("run <endpoint>")
  .description("Run a model endpoint")
  .addHelpText(
    "after",
    `
Endpoint format:
  <provider>/<model>              auto-resolves action if unambiguous
  <provider>/<model>/<action>     explicit action

Examples:
  $ mulerouter run alibaba/wan2.6-t2v --prompt "A cat walking"
  $ mulerouter run google/nano-banana-2/generation --prompt "Mountain lake"
  $ mulerouter run minimax/speech-2.8-turbo --prompt "Hello" --voice-id "Charming_Lady"
  $ mulerouter run midjourney/diffusion --prompt "A sunset" --json
  $ mulerouter run alibaba/wan2.6-i2v --prompt "Zoom in" --image /tmp/photo.png

Use 'mulerouter params <endpoint>' to see available parameters.`,
  )
  .option("--api-key <key>", "override API key")
  .option("--base-url <url>", "override base URL")
  .option("--site <site>", "override site (mulerouter, mulerun)")
  .option("--no-wait", "create task without waiting for completion")
  .option("--poll-interval <seconds>", "polling interval in seconds", "20")
  .option("--max-wait <seconds>", "maximum wait time in seconds", "1800")
  .option("--quiet", "suppress progress output")
  .option("--json", "output as JSON")
  .option("--extra <key=value...>", "extra parameters (KEY=VALUE)", collect, [])
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .action(async (endpoint, options, command) => {
    // Collect unknown options as model parameters
    const modelParams = parseUnknownOptions(command.args);
    const merged = { ...options, ...modelParams };
    await executeRun(endpoint, merged);
  });

// ── status ───────────────────────────────────────────────────────
program
  .command("status <api-path> <task-id>")
  .description("Check the status of an async task")
  .addHelpText(
    "after",
    `
The api-path is shown in the --no-wait output. Examples:

  $ mulerouter run alibaba/wan2.6-t2v --prompt "A cat" --no-wait --json
  # → {"task_id":"abc123","api_path":"/vendors/alibaba/v1/wan2.6-t2v/generation",...}

  $ mulerouter status /vendors/alibaba/v1/wan2.6-t2v/generation abc123
  $ mulerouter status /vendors/alibaba/v1/wan2.6-t2v/generation abc123 --wait
  $ mulerouter status /vendors/alibaba/v1/wan2.6-t2v/generation abc123 --json`,
  )
  .option("--api-key <key>", "override API key")
  .option("--base-url <url>", "override base URL")
  .option("--site <site>", "override site (mulerouter, mulerun)")
  .option("--wait", "poll until task completes")
  .option("--poll-interval <seconds>", "polling interval in seconds", "20")
  .option("--max-wait <seconds>", "maximum wait time in seconds", "1800")
  .option("--result-key <key>", "response field containing result URLs (auto-detected by default)")
  .option("--quiet", "suppress progress output")
  .option("--json", "output as JSON")
  .action(async (apiPath, taskId, options) => {
    await executeStatus(apiPath, taskId, options);
  });

// ── config ────────────────────────────────────────────────────────
program
  .command("config")
  .description("Show current configuration and setup help")
  .action(() => {
    executeConfig();
  });

/** Collect repeatable options into an array. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** Parse unknown CLI options into a key-value map. */
function parseUnknownOptions(args: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const raw = arg.slice(2);
      const eqIndex = raw.indexOf("=");

      let key: string;
      let value: unknown;
      let consumed = 1;

      if (eqIndex !== -1) {
        key = raw.slice(0, eqIndex);
        value = raw.slice(eqIndex + 1);
      } else {
        key = raw;
        const nextArg = args[i + 1];
        if (nextArg === undefined || nextArg.startsWith("--")) {
          value = true;
        } else {
          value = nextArg;
          consumed = 2;
        }
      }

      // Normalize --no-KEY: strip prefix and invert any explicit value.
      // --no-foo            -> foo=false
      // --no-foo=true|1     -> foo=false
      // --no-foo=false|0    -> foo=true
      // --no-foo <value>    -> foo=false (Commander-style --no- flags don't take values)
      if (key.startsWith("no-")) {
        const actualKey = key.slice(3);
        if (typeof value === "string") {
          const lowered = value.toLowerCase();
          value = !(lowered === "true" || lowered === "1");
        } else {
          value = false;
        }
        result[actualKey] = value;
      } else {
        result[key] = value;
      }
      i += consumed;
    } else {
      i++;
    }
  }
  return result;
}

export { program };

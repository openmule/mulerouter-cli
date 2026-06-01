import type { TaskStatus } from "@mulerouter/core";
import {
  APIClient,
  isSuccessStatus,
  isTerminalStatus,
  loadConfig,
  parseTaskResponse,
  pollTask,
  registry,
} from "@mulerouter/core";
import pc from "picocolors";
import { parsePositiveInt } from "../utils.js";

interface StatusOptions {
  apiKey?: string;
  baseUrl?: string;
  site?: string;
  wait?: boolean;
  pollInterval?: string;
  maxWait?: string;
  quiet?: boolean;
  json?: boolean;
  resultKey?: string;
}

/** Look up an endpoint's resultKey by its registered apiPath. */
function resultKeyForApiPath(apiPath: string): string | undefined {
  for (const ep of registry.listAll()) {
    if (ep.apiPath === apiPath) return ep.resultKey;
  }
  return undefined;
}

function formatStatus(
  taskId: string,
  status: string,
  error: string | undefined,
  results: string[] | undefined,
  json: boolean,
  opts: { timedOut?: boolean; apiPath?: string } = {},
): string {
  if (json) {
    return JSON.stringify(
      {
        task_id: taskId,
        status,
        ...(opts.timedOut ? { timed_out: true } : {}),
        ...(opts.apiPath ? { api_path: opts.apiPath } : {}),
        ...(error ? { error } : {}),
        ...(results?.length ? { results } : {}),
      },
      null,
      2,
    );
  }

  const lines: string[] = [];
  lines.push(`Task ID: ${taskId}`);
  const color = isSuccessStatus(status as TaskStatus)
    ? pc.green
    : opts.timedOut
      ? pc.yellow
      : isTerminalStatus(status as TaskStatus)
        ? pc.red
        : pc.yellow;
  lines.push(`Status:  ${color(status)}${opts.timedOut ? pc.yellow(" (timeout)") : ""}`);
  if (error) lines.push(`Error:   ${opts.timedOut ? pc.yellow(error) : pc.red(error)}`);
  if (results?.length) {
    lines.push("");
    lines.push(pc.bold("Results:"));
    for (const url of results) {
      lines.push(`  ${url}`);
    }
  }
  if (opts.timedOut && opts.apiPath && taskId) {
    lines.push("");
    lines.push(pc.bold("Resume:"));
    lines.push(`  mulerouter status ${opts.apiPath} ${taskId} --wait`);
  }
  return lines.join("\n");
}

export async function executeStatus(
  endpoint: string,
  taskId: string,
  options: StatusOptions,
): Promise<void> {
  let config: ReturnType<typeof loadConfig> | undefined;
  try {
    config = loadConfig({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      site: options.site,
    });
  } catch (error) {
    console.error(pc.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exitCode = 1;
    return;
  }

  const client = new APIClient(config);
  const verbose = !options.quiet;
  const resultKey = options.resultKey ?? resultKeyForApiPath(endpoint) ?? "images";

  try {
    if (options.wait) {
      const pollInterval = parsePositiveInt(options.pollInterval, 20, "--poll-interval") * 1000;
      const maxWait = parsePositiveInt(options.maxWait, 1800, "--max-wait") * 1000;

      const result = await pollTask({
        client,
        taskPath: endpoint,
        taskId,
        resultKey,
        interval: pollInterval,
        maxWait,
        verbose,
      });

      console.log(
        formatStatus(result.taskId, result.status, result.error, result.results, !!options.json, {
          timedOut: result.timedOut,
          apiPath: endpoint,
        }),
      );

      if (result.timedOut) {
        process.exitCode = 2;
      } else if (!isSuccessStatus(result.status)) {
        process.exitCode = 1;
      }
    } else {
      const pollUrl = `${endpoint}/${taskId}`;
      const response = await client.get(pollUrl);

      if (!response.success) {
        console.error(pc.red(`Error: ${response.error ?? "Request failed"}`));
        process.exitCode = 1;
        return;
      }

      const result = parseTaskResponse(response.data ?? {}, resultKey);
      console.log(
        formatStatus(result.taskId, result.status, result.error, result.results, !!options.json, {
          apiPath: endpoint,
        }),
      );

      if (result.status === "failed") {
        process.exitCode = 1;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(pc.red(`Error: ${message}`));
    process.exitCode = 1;
  }
}

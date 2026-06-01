import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { ModelEndpoint, TaskResult } from "@mulerouter/core";
import {
  APIClient,
  createAndPollTask,
  isSuccessStatus,
  loadConfig,
  mediaKindForParam,
  processImageParams,
  toCliFlag,
  validateMediaPath,
} from "@mulerouter/core";
import pc from "picocolors";
import { parsePositiveInt } from "../utils.js";
import { resolveEndpoint } from "./params.js";

interface RunOptions {
  apiKey?: string;
  baseUrl?: string;
  site?: string;
  wait?: boolean; // Commander.js stores --no-wait as wait=false
  pollInterval?: string;
  maxWait?: string;
  quiet?: boolean;
  json?: boolean;
  extra?: string[];
  [key: string]: unknown;
}

/** Parse --extra KEY=VALUE pairs. */
function parseExtras(extras: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const item of extras) {
    const eqIndex = item.indexOf("=");
    if (eqIndex === -1) {
      throw new Error(`Invalid --extra format: '${item}'. Expected KEY=VALUE.`);
    }
    const key = item.slice(0, eqIndex);
    const value = item.slice(eqIndex + 1);
    try {
      result[key] = JSON.parse(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

/** Warn when media parameters reference local files that don't exist
 *  or have unsupported extensions. Catches typos and silent fall-throughs
 *  where a "URL" is actually a path the server cannot fetch. */
function warnMissingMediaFiles(body: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(body)) {
    const kind = mediaKindForParam(key);
    if (kind === undefined) continue;
    const paths = Array.isArray(value) ? value : [value];
    for (const p of paths) {
      if (typeof p !== "string") continue;
      if (p.startsWith("http://") || p.startsWith("https://") || p.startsWith("data:")) continue;
      const flag = toCliFlag(key);
      const resolved = resolve(p);
      const stat = existsSync(resolved) ? statSync(resolved, { throwIfNoEntry: false }) : undefined;
      if (!stat?.isFile()) {
        process.stderr.write(pc.yellow(`Warning: File not found for --${flag}: ${p}\n`));
        continue;
      }
      // File exists — make sure the validator accepts it. If it doesn't (bad
      // extension, sensitive dir, oversized), the value would otherwise pass
      // through as a literal path string and the API would reject it.
      try {
        validateMediaPath(p, kind);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(pc.yellow(`Warning: --${flag} ${msg}\n`));
      }
    }
  }
}

/** Build request body from CLI options and endpoint definition. */
function buildRequestBody(endpoint: ModelEndpoint, options: RunOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  for (const param of endpoint.parameters) {
    const hyphenKey = toCliFlag(param.name);

    let value = options[hyphenKey] ?? options[param.name];
    if (value === undefined) continue;

    const flag = `--${hyphenKey}`;

    // Type coercion with validation
    if (param.type === "integer" && typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isNaN(parsed)) {
        throw new Error(`Invalid value for ${flag}: '${value}' is not a valid integer.`);
      }
      value = parsed;
    } else if (param.type === "number" && typeof value === "string") {
      const parsed = Number.parseFloat(value);
      if (Number.isNaN(parsed)) {
        throw new Error(`Invalid value for ${flag}: '${value}' is not a valid number.`);
      }
      value = parsed;
    } else if (param.type === "array" && typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch {
        throw new Error(`Parameter '${param.name}' must be a valid JSON array.`);
      }
    } else if (param.type === "boolean") {
      if (typeof value === "string") {
        value = value === "true";
      }
    }

    // Validate enum values
    if (param.enum && param.enum.length > 0) {
      const enumValues = param.enum.map(String);
      if (!enumValues.includes(String(value))) {
        throw new Error(
          `Invalid value for ${flag}: '${value}'. Valid choices: ${param.enum.join(", ")}`,
        );
      }
    }

    body[param.name] = value;
  }

  // Apply --extra params
  if (options.extra?.length) {
    Object.assign(body, parseExtras(options.extra));
  }

  return body;
}

/** Validate required parameters are present and non-empty. */
function validateRequired(endpoint: ModelEndpoint, body: Record<string, unknown>): void {
  const missing: string[] = [];
  const empty: string[] = [];

  for (const p of endpoint.parameters) {
    if (!p.required) continue;
    const flag = `--${toCliFlag(p.name)}`;
    const value = body[p.name];
    if (value === undefined) {
      missing.push(flag);
    } else if (p.type === "string" && typeof value === "string" && value.trim() === "") {
      empty.push(flag);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required parameter(s): ${missing.join(", ")}. ` +
        `Use 'mulerouter params ${endpoint.modelId}/${endpoint.action}' to see all parameters.`,
    );
  }

  if (empty.length > 0) {
    throw new Error(
      `Empty value for required parameter(s): ${empty.join(", ")}. These parameters must not be empty.`,
    );
  }
}

/** Format task result for output. */
function formatResult(result: TaskResult, json: boolean, apiPath?: string): string {
  if (json) {
    return JSON.stringify(
      {
        task_id: result.taskId,
        status: result.status,
        ...(result.timedOut ? { timed_out: true } : {}),
        ...(apiPath ? { api_path: apiPath } : {}),
        ...(result.error ? { error: result.error } : {}),
        ...(result.results ? { [result.resultKey ?? "results"]: result.results } : {}),
        data: result.data,
      },
      null,
      2,
    );
  }

  const lines: string[] = [];
  lines.push(`Task ID: ${result.taskId}`);
  const statusColor = isSuccessStatus(result.status)
    ? pc.green
    : result.timedOut
      ? pc.yellow
      : pc.red;
  lines.push(`Status:  ${statusColor(result.status)}${result.timedOut ? pc.yellow(" (timeout)") : ""}`);

  if (result.error) {
    lines.push(`Error:   ${result.timedOut ? pc.yellow(result.error) : pc.red(result.error)}`);
  }

  if (result.results?.length) {
    lines.push("");
    lines.push(pc.bold("Results:"));
    for (const url of result.results) {
      lines.push(`  ${url}`);
    }
  }

  if (result.timedOut && apiPath && result.taskId) {
    lines.push("");
    lines.push(pc.bold("Resume:"));
    lines.push(`  mulerouter status ${apiPath} ${result.taskId} --wait`);
  }

  return lines.join("\n");
}

/** Execute the run command. */
export async function executeRun(identifier: string, options: RunOptions): Promise<void> {
  let endpoint: ModelEndpoint;
  try {
    endpoint = resolveEndpoint(identifier);
  } catch (error) {
    console.error(pc.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exitCode = 1;
    return;
  }

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

  try {
    // Build request body (once)
    const rawBody = buildRequestBody(endpoint, options);

    // Validate required params first — before any transforms
    validateRequired(endpoint, rawBody);

    // Apply custom body transformer if present, otherwise use raw body
    let body = endpoint.buildRequestBody ? endpoint.buildRequestBody(rawBody) : rawBody;

    // Warn about local file paths that don't exist for image params
    warnMissingMediaFiles(rawBody);

    // Convert local image paths to base64
    body = processImageParams(body);

    if (options.wait === false) {
      if (verbose) {
        process.stderr.write(`Creating task at ${endpoint.apiPath}...\n`);
      }
      const response = await client.post(endpoint.apiPath, body);
      if (!response.success) {
        throw new Error(response.error ?? "Request failed");
      }
      const rawTaskInfo = response.data?.task_info;
      const taskInfo =
        typeof rawTaskInfo === "object" && rawTaskInfo !== null
          ? (rawTaskInfo as Record<string, unknown>)
          : {};
      const taskId = taskInfo.id != null ? String(taskInfo.id) : "";
      if (!taskId) {
        throw new Error(
          `Task creation succeeded but the response did not include a task ID. Raw response: ${JSON.stringify(response.data ?? {})}`,
        );
      }
      if (options.json) {
        const output = {
          ...(response.data ?? {}),
          api_path: endpoint.apiPath,
          task_id: taskId,
        };
        console.log(JSON.stringify(output, null, 2));
      } else {
        console.log(`Task ID:  ${taskId}`);
        console.log(`API Path: ${endpoint.apiPath}`);
        console.log("Status:   created (not waiting for completion)");
        console.log("");
        console.log(`Check status: mulerouter status ${endpoint.apiPath} ${taskId}`);
        console.log(`Wait:         mulerouter status ${endpoint.apiPath} ${taskId} --wait`);
      }
      return;
    }

    const pollInterval = parsePositiveInt(options.pollInterval, 20, "--poll-interval") * 1000;
    const maxWait = parsePositiveInt(options.maxWait, 1800, "--max-wait") * 1000;

    const result = await createAndPollTask({
      client,
      endpointPath: endpoint.apiPath,
      requestBody: body,
      resultKey: endpoint.resultKey,
      interval: pollInterval,
      maxWait,
      verbose,
    });

    console.log(formatResult(result, !!options.json, endpoint.apiPath));

    if (result.timedOut) {
      // Task may still be processing — surface as non-fatal so the user can resume.
      process.exitCode = 2;
    } else if (!isSuccessStatus(result.status)) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(pc.red(`Error: ${message}`));
    process.exitCode = 1;
  }
}

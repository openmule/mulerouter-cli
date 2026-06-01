import type { APIClient } from "./client.js";
import type { TaskResult, TaskStatus } from "./types.js";
import { sleep } from "./utils.js";

const TERMINAL_STATUSES: Set<TaskStatus> = new Set(["completed", "succeeded", "failed"]);
const SUCCESS_STATUSES: Set<TaskStatus> = new Set(["completed", "succeeded"]);

/** Check if a task status is terminal (completed or failed). */
export function isTerminalStatus(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** Check if a task status indicates success. */
export function isSuccessStatus(status: TaskStatus): boolean {
  return SUCCESS_STATUSES.has(status);
}

const FALLBACK_RESULT_KEYS = ["images", "videos", "audios", "image", "video", "audio"];

function extractResults(
  responseData: Record<string, unknown>,
  preferredKey: string,
): { key: string; results: string[] | undefined } {
  const candidates = [preferredKey, ...FALLBACK_RESULT_KEYS.filter((k) => k !== preferredKey)];
  for (const key of candidates) {
    const value = responseData[key];
    if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
      return { key, results: value as string[] };
    }
    if (typeof value === "string") {
      return { key, results: [value] };
    }
  }
  return { key: preferredKey, results: undefined };
}

/** Parse task response data into a TaskResult. */
export function parseTaskResponse(
  responseData: Record<string, unknown>,
  resultKey = "images",
): TaskResult {
  const taskInfo = (responseData.task_info ?? {}) as Record<string, unknown>;
  const taskId = String(taskInfo.id ?? "");
  const statusStr = String(taskInfo.status ?? "pending");

  const validStatuses: TaskStatus[] = [
    "pending",
    "queued",
    "running",
    "processing",
    "completed",
    "succeeded",
    "failed",
  ];
  const status: TaskStatus = validStatuses.includes(statusStr as TaskStatus)
    ? (statusStr as TaskStatus)
    : "pending";

  let error: string | undefined;
  if (status === "failed") {
    const errorInfo = taskInfo.error;
    if (typeof errorInfo === "object" && errorInfo !== null) {
      const errObj = errorInfo as Record<string, unknown>;
      error = (errObj.detail as string) ?? (errObj.title as string) ?? JSON.stringify(errorInfo);
    } else if (errorInfo !== undefined) {
      error = String(errorInfo);
    }
  }

  const extracted = isSuccessStatus(status)
    ? extractResults(responseData, resultKey)
    : { key: resultKey, results: undefined };

  return {
    taskId,
    status,
    data: responseData,
    error,
    resultKey: extracted.key,
    results: extracted.results,
  };
}

/**
 * Poll a task until completion.
 */
export async function pollTask(options: {
  client: APIClient;
  taskPath: string;
  taskId: string;
  resultKey?: string;
  interval?: number;
  maxWait?: number;
  verbose?: boolean;
  onStatus?: (elapsed: number, status: string) => void;
}): Promise<TaskResult> {
  const {
    client,
    taskPath,
    taskId,
    resultKey = "images",
    interval = 20_000,
    maxWait = 900_000,
    verbose = true,
    onStatus,
  } = options;

  const startTime = Date.now();
  const pollUrl = `${taskPath}/${taskId}`;

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxWait) {
      return {
        taskId,
        status: "processing",
        data: {},
        error: `Polling timeout after ${maxWait / 1000}s — task may still be processing server-side.`,
        timedOut: true,
        apiPath: taskPath,
      };
    }

    const response = await client.get(pollUrl);
    if (!response.success) {
      return {
        taskId,
        status: "failed",
        data: response.data ?? {},
        error: response.error,
      };
    }

    const result = parseTaskResponse(response.data ?? {}, resultKey);

    if (verbose || onStatus) {
      const elapsedSec = (elapsed / 1000).toFixed(1);
      if (onStatus) {
        onStatus(elapsed, result.status);
      } else {
        process.stderr.write(
          `[${elapsedSec}s] Task ${taskId.slice(0, 8)}... status: ${result.status}\n`,
        );
      }
    }

    if (isTerminalStatus(result.status)) {
      return { ...result, apiPath: taskPath };
    }

    await sleep(interval);
  }
}

/**
 * Create a task and poll until completion.
 */
export async function createAndPollTask(options: {
  client: APIClient;
  endpointPath: string;
  requestBody: Record<string, unknown>;
  resultKey?: string;
  interval?: number;
  maxWait?: number;
  verbose?: boolean;
  onStatus?: (elapsed: number, status: string) => void;
}): Promise<TaskResult> {
  const {
    client,
    endpointPath,
    requestBody,
    resultKey = "images",
    interval,
    maxWait,
    verbose = true,
    onStatus,
  } = options;

  if (verbose) {
    process.stderr.write(`Creating task at ${endpointPath}...\n`);
  }

  const response = await client.post(endpointPath, requestBody);
  if (!response.success) {
    return {
      taskId: "",
      status: "failed",
      data: response.data ?? {},
      error: response.error,
    };
  }

  const taskInfo = (response.data as Record<string, unknown> | undefined)?.task_info as
    | Record<string, unknown>
    | undefined;
  const taskId = taskInfo?.id != null ? String(taskInfo.id) : undefined;

  if (!taskId) {
    return {
      taskId: "",
      status: "failed",
      data: response.data ?? {},
      error: "No task ID returned",
    };
  }

  if (verbose) {
    process.stderr.write(`Task created: ${taskId}\n`);
  }

  return pollTask({
    client,
    taskPath: endpointPath,
    taskId,
    resultKey,
    interval,
    maxWait,
    verbose,
    onStatus,
  });
}

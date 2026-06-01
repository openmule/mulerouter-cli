import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIClient } from "../src/client.js";
import { createAndPollTask, pollTask } from "../src/task.js";
import type { Config } from "../src/types.js";

// Create a mock client without making real requests
function createMockClient(): APIClient {
  const config: Config = {
    apiKey: "test",
    baseUrl: "https://test.api.com",
    timeout: 5000,
    maxRetries: 0,
  };
  return new APIClient(config);
}

describe("pollTask", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should return immediately when task is already completed", async () => {
    const client = createMockClient();
    vi.spyOn(client, "get").mockResolvedValueOnce({
      success: true,
      data: {
        task_info: { id: "task-1", status: "completed" },
        images: ["https://example.com/img.png"],
      },
      statusCode: 200,
    });

    const result = await pollTask({
      client,
      taskPath: "/test/path",
      taskId: "task-1",
      resultKey: "images",
      verbose: false,
    });

    expect(result.status).toBe("completed");
    expect(result.results).toEqual(["https://example.com/img.png"]);
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it("should return immediately when task has failed", async () => {
    const client = createMockClient();
    vi.spyOn(client, "get").mockResolvedValueOnce({
      success: true,
      data: {
        task_info: { id: "task-2", status: "failed", error: { detail: "Content violation" } },
      },
      statusCode: 200,
    });

    const result = await pollTask({
      client,
      taskPath: "/test/path",
      taskId: "task-2",
      verbose: false,
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Content violation");
  });

  it("should poll until task completes", async () => {
    const client = createMockClient();
    const getSpy = vi
      .spyOn(client, "get")
      .mockResolvedValueOnce({
        success: true,
        data: { task_info: { id: "task-3", status: "running" } },
        statusCode: 200,
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          task_info: { id: "task-3", status: "succeeded" },
          videos: ["https://example.com/video.mp4"],
        },
        statusCode: 200,
      });

    const result = await pollTask({
      client,
      taskPath: "/test/path",
      taskId: "task-3",
      resultKey: "videos",
      interval: 10, // 10ms for fast test
      verbose: false,
    });

    expect(result.status).toBe("succeeded");
    expect(result.results).toEqual(["https://example.com/video.mp4"]);
    expect(getSpy).toHaveBeenCalledTimes(2);
  });

  it("should return failure on API error during polling", async () => {
    const client = createMockClient();
    vi.spyOn(client, "get").mockResolvedValueOnce({
      success: false,
      error: "Server error",
      statusCode: 500,
    });

    const result = await pollTask({
      client,
      taskPath: "/test/path",
      taskId: "task-4",
      verbose: false,
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Server error");
  });

  it("should timeout when maxWait is exceeded", async () => {
    const client = createMockClient();
    vi.spyOn(client, "get").mockResolvedValue({
      success: true,
      data: { task_info: { id: "task-5", status: "running" } },
      statusCode: 200,
    });

    const result = await pollTask({
      client,
      taskPath: "/test/path",
      taskId: "task-5",
      interval: 10,
      maxWait: 1, // 1ms — will timeout on second check
      verbose: false,
    });

    expect(result.status).toBe("processing");
    expect(result.timedOut).toBe(true);
    expect(result.error).toContain("Polling timeout");
    expect(result.apiPath).toBe("/test/path");
  });

  it("should call onStatus callback when provided", async () => {
    const client = createMockClient();
    vi.spyOn(client, "get").mockResolvedValueOnce({
      success: true,
      data: { task_info: { id: "task-6", status: "completed" }, images: [] },
      statusCode: 200,
    });

    const onStatus = vi.fn();

    await pollTask({
      client,
      taskPath: "/test/path",
      taskId: "task-6",
      verbose: false,
      onStatus,
    });

    expect(onStatus).toHaveBeenCalledWith(expect.any(Number), "completed");
  });

  it("should use correct poll URL", async () => {
    const client = createMockClient();
    const getSpy = vi.spyOn(client, "get").mockResolvedValueOnce({
      success: true,
      data: { task_info: { id: "abc-123", status: "completed" }, images: [] },
      statusCode: 200,
    });

    await pollTask({
      client,
      taskPath: "/vendors/google/v1/nano-banana-2/generation",
      taskId: "abc-123",
      verbose: false,
    });

    expect(getSpy).toHaveBeenCalledWith("/vendors/google/v1/nano-banana-2/generation/abc-123");
  });
});

describe("createAndPollTask", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should create task and poll until completion", async () => {
    const client = createMockClient();
    const postSpy = vi.spyOn(client, "post").mockResolvedValueOnce({
      success: true,
      data: { task_info: { id: "new-task-1" } },
      statusCode: 200,
    });
    const getSpy = vi.spyOn(client, "get").mockResolvedValueOnce({
      success: true,
      data: {
        task_info: { id: "new-task-1", status: "completed" },
        images: ["https://example.com/result.png"],
      },
      statusCode: 200,
    });

    const result = await createAndPollTask({
      client,
      endpointPath: "/test/create",
      requestBody: { prompt: "test" },
      resultKey: "images",
      interval: 10,
      verbose: false,
    });

    expect(result.status).toBe("completed");
    expect(result.results).toEqual(["https://example.com/result.png"]);
    expect(postSpy).toHaveBeenCalledWith("/test/create", { prompt: "test" });
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it("should return failure when task creation fails", async () => {
    const client = createMockClient();
    vi.spyOn(client, "post").mockResolvedValueOnce({
      success: false,
      error: "Rate limited",
      statusCode: 429,
    });

    const result = await createAndPollTask({
      client,
      endpointPath: "/test/create",
      requestBody: { prompt: "test" },
      verbose: false,
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Rate limited");
    expect(result.taskId).toBe("");
  });

  it("should return failure when no task ID is returned", async () => {
    const client = createMockClient();
    vi.spyOn(client, "post").mockResolvedValueOnce({
      success: true,
      data: { task_info: {} }, // no id
      statusCode: 200,
    });

    const result = await createAndPollTask({
      client,
      endpointPath: "/test/create",
      requestBody: { prompt: "test" },
      verbose: false,
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("No task ID returned");
  });

  it("should use audios result key for audio endpoints", async () => {
    const client = createMockClient();
    vi.spyOn(client, "post").mockResolvedValueOnce({
      success: true,
      data: { task_info: { id: "audio-task" } },
      statusCode: 200,
    });
    vi.spyOn(client, "get").mockResolvedValueOnce({
      success: true,
      data: {
        task_info: { id: "audio-task", status: "completed" },
        audios: ["https://example.com/speech.mp3"],
      },
      statusCode: 200,
    });

    const result = await createAndPollTask({
      client,
      endpointPath: "/test/tts",
      requestBody: { prompt: "hello" },
      resultKey: "audios",
      interval: 10,
      verbose: false,
    });

    expect(result.results).toEqual(["https://example.com/speech.mp3"]);
    expect(result.resultKey).toBe("audios");
  });
});

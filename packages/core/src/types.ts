/** Supported API sites. */
export type Site = "mulerouter" | "mulerun";

/** Type of input accepted by a model. */
export type InputType = "text" | "image" | "video" | "audio";

/** Type of output produced by a model. */
export type OutputType = "image" | "video" | "text" | "audio";

/** Parameter definition for a model endpoint. */
export interface ModelParameter {
  name: string;
  type: "string" | "integer" | "number" | "boolean" | "array";
  description: string;
  required?: boolean;
  default?: string | number | boolean;
  enum?: (string | number)[];
}

/** Registration info for a model endpoint. */
export interface ModelEndpoint {
  modelId: string;
  action: string;
  provider: string;
  modelName: string;
  description: string;
  inputTypes: InputType[];
  outputType: OutputType;
  apiPath: string;
  parameters: ModelParameter[];
  availableOn: Site[];
  resultKey: string;
  tags?: string[];
  /**
   * Optional custom request body transformer.
   * Used by models that need nested object structures (e.g., MiniMax voice_setting).
   */
  buildRequestBody?: (params: Record<string, unknown>) => Record<string, unknown>;
}

/** Standardized API response wrapper. */
export interface APIResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  statusCode: number;
  traceparent?: string;
}

/** Task status values. */
export type TaskStatus =
  | "pending"
  | "queued"
  | "running"
  | "processing"
  | "completed"
  | "succeeded"
  | "failed";

/** Result of a task operation. */
export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  data: Record<string, unknown>;
  error?: string;
  resultKey?: string;
  results?: string[];
  /** True when polling was aborted because maxWait elapsed; task may still be processing server-side. */
  timedOut?: boolean;
  /** API path used to poll the task — useful for resuming with `status` after a timeout. */
  apiPath?: string;
}

/** Configuration for the API client. */
export interface Config {
  apiKey: string;
  site?: Site;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  version?: string;
}

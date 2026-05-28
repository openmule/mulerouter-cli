import { registerEndpoint } from "../../registry.js";
import type { ModelEndpoint } from "../../types.js";

const endpoint: ModelEndpoint = {
  modelId: "klingai/kling-v3-omni-v2v-edit",
  action: "generation",
  provider: "klingai",
  modelName: "kling-v3-omni-v2v-edit",
  description: "Kling V3 Omni Video Edit: Edit existing videos with text prompts and references",
  inputTypes: ["video", "text"],
  outputType: "video",
  apiPath: "/vendors/klingai/v1/kling-v3-omni/video-to-video/edit",
  availableOn: ["mulerouter", "mulerun"],
  resultKey: "videos",
  tags: ["SOTA"],
  parameters: [
    {
      name: "prompt",
      type: "string",
      description:
        "Text prompt for editing (max 2500 chars, required). Use @Video1 to reference videos",
      required: true,
    },
    {
      name: "negative_prompt",
      type: "string",
      description: "Text describing what to avoid (max 2500 chars)",
    },
    {
      name: "video",
      type: "string",
      description: "Video URL to edit (mp4/mov, 3-10s, 720-2160px, ≤200MB)",
      required: true,
    },
    {
      name: "keep_audio",
      type: "boolean",
      description: "Whether to keep the original audio from the video",
      default: false,
    },
    {
      name: "images",
      type: "array",
      description: "Reference images (JSON array of URL/Base64 strings)",
    },
    {
      name: "elements",
      type: "array",
      description: "Element list (JSON array). Total elements+images must not exceed 4",
    },
    {
      name: "model_name",
      type: "string",
      description: "Model version",
      default: "kling-v3-omni",
      enum: ["kling-v3-omni"],
    },
    {
      name: "mode",
      type: "string",
      description: "Generation mode (std=720P, pro=1080P)",
      default: "pro",
      enum: ["std", "pro"],
    },
  ],
};

registerEndpoint(endpoint);

export { endpoint };

import { readFileSync, statSync } from "node:fs";
import { basename, resolve, sep } from "node:path";
import { lookup } from "./mime.js";

type MediaKind = "image" | "video" | "audio";

/** Parameter names that accept image input. */
export const IMAGE_PARAM_NAMES = new Set([
  "image",
  "images",
  "first_frame",
  "last_frame",
  "last_frame_image",
  "first_frame_url",
  "last_frame_url",
  "ref_images_url",
  "reference_images",
  "mask_image_url",
  "mask",
]);

/** Parameter names that accept video input (URL, base64, or local file). */
export const VIDEO_PARAM_NAMES = new Set([
  "video",
  "video_url",
  "mask_video_url",
  "reference_video",
  "reference_video_url",
]);

/** Parameter names that accept audio input (URL, base64, or local file). */
export const AUDIO_PARAM_NAMES = new Set(["audio_url", "reference_audio", "reference_audio_url"]);

const PARAM_KIND = new Map<string, MediaKind>();
for (const n of IMAGE_PARAM_NAMES) PARAM_KIND.set(n, "image");
for (const n of VIDEO_PARAM_NAMES) PARAM_KIND.set(n, "video");
for (const n of AUDIO_PARAM_NAMES) PARAM_KIND.set(n, "audio");

/** Union of all media parameter names. */
export const MEDIA_PARAM_NAMES = new Set<string>([
  ...IMAGE_PARAM_NAMES,
  ...VIDEO_PARAM_NAMES,
  ...AUDIO_PARAM_NAMES,
]);

const ALLOWED_EXTENSIONS: Record<MediaKind, Set<string>> = {
  image: new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".bmp",
    ".webp",
    ".tiff",
    ".tif",
    ".svg",
    ".ico",
    ".heic",
    ".heif",
    ".avif",
  ]),
  video: new Set([".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"]),
  audio: new Set([".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".opus", ".pcm"]),
};

const MAX_SIZE: Record<MediaKind, number> = {
  image: 20 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
};

/** Sensitive home directories that should never be read from. */
const SENSITIVE_HOME_DIRS = new Set([
  ".ssh",
  ".gnupg",
  ".gpg",
  ".aws",
  ".azure",
  ".gcloud",
  ".config",
  ".kube",
  ".docker",
  ".npm",
  ".pypirc",
]);

/** Sensitive system directory prefixes. */
const SENSITIVE_SYSTEM_PREFIXES = ["/etc", "/proc", "/sys", "/dev"];

/** Check if a parameter name is an image parameter. */
export function isImageParam(name: string): boolean {
  return IMAGE_PARAM_NAMES.has(name);
}

/** Check if a parameter name is a video parameter. */
export function isVideoParam(name: string): boolean {
  return VIDEO_PARAM_NAMES.has(name);
}

/** Check if a parameter name is an audio parameter. */
export function isAudioParam(name: string): boolean {
  return AUDIO_PARAM_NAMES.has(name);
}

/** Check if a parameter name is any kind of media (image/video/audio). */
export function isMediaParam(name: string): boolean {
  return MEDIA_PARAM_NAMES.has(name);
}

/** Get the media kind for a parameter name, or undefined if not a media param. */
export function mediaKindForParam(name: string): MediaKind | undefined {
  return PARAM_KIND.get(name);
}

/** Get the file extension in lowercase. */
function getExtension(filePath: string): string {
  const name = basename(filePath);
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex === -1) return "";
  return name.slice(dotIndex).toLowerCase();
}

/** Validate that a file path points to a safe, allowed media file.
 * Throws on invalid paths. */
export function validateMediaPath(filePath: string, kind: MediaKind): string {
  const resolved = resolve(filePath);

  const ext = getExtension(resolved);
  const allowed = ALLOWED_EXTENSIONS[kind];
  if (!allowed.has(ext)) {
    const list = [...allowed].sort().join(", ");
    throw new Error(
      `File '${filePath}' has extension '${ext}' which is not an allowed ${kind} format. Allowed extensions: ${list}`,
    );
  }

  for (const prefix of SENSITIVE_SYSTEM_PREFIXES) {
    if (resolved === prefix || resolved.startsWith(`${prefix}/`)) {
      throw new Error(`Access denied: '${filePath}' is in a sensitive system directory`);
    }
  }

  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  if (home && (resolved === home || resolved.startsWith(home + sep))) {
    const relative = resolved.slice(home.length + 1);
    const firstComponent = relative.split(sep)[0];
    if (firstComponent?.startsWith(".") && SENSITIVE_HOME_DIRS.has(firstComponent)) {
      throw new Error(`Access denied: '${filePath}' is in a sensitive home directory`);
    }
  }

  const stat = statSync(resolved, { throwIfNoEntry: false });
  const max = MAX_SIZE[kind];
  if (stat && stat.size > max) {
    throw new Error(
      `File '${filePath}' is ${(stat.size / 1024 / 1024).toFixed(1)}MB, exceeding the ${max / 1024 / 1024}MB ${kind} limit`,
    );
  }

  return resolved;
}

/** Back-compat: image-only validator. */
export function validateImagePath(filePath: string): string {
  return validateMediaPath(filePath, "image");
}

/** Check if a string value looks like a local file path of the given media kind.
 *  Returns false for URLs and data URIs. Throws if the path resolves to an existing
 *  file but is rejected for a non-existence reason (bad extension, sensitive dir,
 *  oversized) — callers should surface those to the user instead of silently
 *  treating the value as a URL. */
export function isLocalMediaFile(value: string, kind: MediaKind): boolean {
  if (typeof value !== "string") return false;
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:")) {
    return false;
  }
  // Existence first — if no such file, treat as a non-local string (URL, ID, etc.)
  const resolved = resolve(value);
  const stat = statSync(resolved, { throwIfNoEntry: false });
  if (!stat?.isFile()) return false;
  // File exists — validate. Throws on disallowed extension / sensitive dir / oversize.
  validateMediaPath(value, kind);
  return true;
}

/** Back-compat: image-only check. */
export function isLocalImageFile(value: string): boolean {
  try {
    return isLocalMediaFile(value, "image");
  } catch {
    return false;
  }
}

/** Convert a local media file to a base64 data URI. */
export function fileToBase64(filePath: string, kind: MediaKind = "image"): string {
  const resolved = validateMediaPath(filePath, kind);
  const fallbackMime =
    kind === "image" ? "image/png" : kind === "video" ? "video/mp4" : "audio/mpeg";
  const mimeType = lookup(resolved) ?? fallbackMime;
  const data = readFileSync(resolved);
  const base64 = data.toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

/** Convert a media parameter value, encoding local files as base64 data URIs.
 *  If a local file exists but is rejected (bad extension, sensitive dir, oversized),
 *  the value is returned unchanged — callers should have already warned via
 *  `warnMissingMediaFiles` so the rejection reason is visible to the user. */
export function convertMediaValue(value: unknown, kind: MediaKind): unknown {
  if (typeof value === "string") {
    try {
      return isLocalMediaFile(value, kind) ? fileToBase64(value, kind) : value;
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) {
    return value.map((v) => convertMediaValue(v, kind));
  }
  return value;
}

/** Back-compat: image-only converter. */
export function convertImageValue(value: unknown): unknown {
  return convertMediaValue(value, "image");
}

/** Image field names inside element objects. */
const ELEMENT_IMAGE_FIELDS = new Set(["frontal_image", "reference_images"]);

/** Process request body, converting local file paths to base64 for all media params. */
export function processImageParams(body: Record<string, unknown>): Record<string, unknown> {
  const result = { ...body };

  for (const [key, value] of Object.entries(result)) {
    const kind = PARAM_KIND.get(key);
    if (kind !== undefined) {
      result[key] = convertMediaValue(value, kind);
    }
  }

  if (Array.isArray(result.elements)) {
    result.elements = result.elements.map((element: unknown) => {
      if (typeof element === "object" && element !== null) {
        const elem = { ...(element as Record<string, unknown>) };
        for (const field of ELEMENT_IMAGE_FIELDS) {
          if (field in elem) {
            elem[field] = convertMediaValue(elem[field], "image");
          }
        }
        return elem;
      }
      return element;
    });
  }

  return result;
}

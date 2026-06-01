import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  convertImageValue,
  fileToBase64,
  IMAGE_PARAM_NAMES,
  isImageParam,
  isLocalImageFile,
  processImageParams,
  validateImagePath,
} from "../src/image.js";

describe("image", () => {
  describe("isImageParam", () => {
    it("should return true for known image params", () => {
      expect(isImageParam("image")).toBe(true);
      expect(isImageParam("images")).toBe(true);
      expect(isImageParam("first_frame")).toBe(true);
      expect(isImageParam("last_frame")).toBe(true);
      expect(isImageParam("mask_image_url")).toBe(true);
      expect(isImageParam("mask")).toBe(true);
      expect(isImageParam("reference_images")).toBe(true);
    });

    it("should return false for non-image params", () => {
      expect(isImageParam("prompt")).toBe(false);
      expect(isImageParam("size")).toBe(false);
      expect(isImageParam("duration")).toBe(false);
    });
  });

  describe("IMAGE_PARAM_NAMES", () => {
    it("should contain expected params", () => {
      expect(IMAGE_PARAM_NAMES.has("image")).toBe(true);
      expect(IMAGE_PARAM_NAMES.has("images")).toBe(true);
      expect(IMAGE_PARAM_NAMES.has("first_frame")).toBe(true);
      expect(IMAGE_PARAM_NAMES.has("last_frame")).toBe(true);
      expect(IMAGE_PARAM_NAMES.has("first_frame_url")).toBe(true);
      expect(IMAGE_PARAM_NAMES.has("last_frame_url")).toBe(true);
      expect(IMAGE_PARAM_NAMES.has("ref_images_url")).toBe(true);
      expect(IMAGE_PARAM_NAMES.has("reference_images")).toBe(true);
      expect(IMAGE_PARAM_NAMES.has("mask_image_url")).toBe(true);
      expect(IMAGE_PARAM_NAMES.has("mask")).toBe(true);
    });
  });

  describe("validateImagePath", () => {
    it("should accept valid image extensions", () => {
      // Create a temp file with valid extension
      const tmpFile = join(tmpdir(), "test-image.png");
      writeFileSync(tmpFile, "fake-png-data");
      expect(() => validateImagePath(tmpFile)).not.toThrow();
      unlinkSync(tmpFile);
    });

    it("should reject non-image extensions", () => {
      expect(() => validateImagePath("/tmp/file.txt")).toThrow("not an allowed image format");
      expect(() => validateImagePath("/tmp/file.py")).toThrow("not an allowed image format");
      expect(() => validateImagePath("/tmp/file.js")).toThrow("not an allowed image format");
    });

    it("should reject .env files", () => {
      // .env has no valid image extension, so it's rejected by extension check first
      expect(() => validateImagePath("/tmp/.env")).toThrow("not an allowed image format");
    });

    it("should reject sensitive system directories", () => {
      expect(() => validateImagePath("/etc/passwd.png")).toThrow("sensitive system directory");
      expect(() => validateImagePath("/proc/1/status.png")).toThrow("sensitive system directory");
      expect(() => validateImagePath("/sys/class/net.png")).toThrow("sensitive system directory");
      expect(() => validateImagePath("/dev/null.png")).toThrow("sensitive system directory");
    });

    it("should reject sensitive home directories", () => {
      const home = process.env.HOME ?? "/home/test";
      expect(() => validateImagePath(`${home}/.ssh/key.png`)).toThrow("sensitive home directory");
      expect(() => validateImagePath(`${home}/.aws/config.png`)).toThrow(
        "sensitive home directory",
      );
      expect(() => validateImagePath(`${home}/.gnupg/key.png`)).toThrow("sensitive home directory");
    });

    it("should accept valid extensions", () => {
      const extensions = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".heic"];
      for (const ext of extensions) {
        const tmpFile = join(tmpdir(), `test${ext}`);
        writeFileSync(tmpFile, "data");
        expect(() => validateImagePath(tmpFile)).not.toThrow();
        unlinkSync(tmpFile);
      }
    });

    it("should reject files exceeding 20MB", () => {
      const tmpFile = join(tmpdir(), "test-huge.png");
      const buf = Buffer.alloc(21 * 1024 * 1024);
      writeFileSync(tmpFile, buf);
      expect(() => validateImagePath(tmpFile)).toThrow("exceeding the 20MB image limit");
      unlinkSync(tmpFile);
    });
  });

  describe("isLocalImageFile", () => {
    it("should return false for URLs", () => {
      expect(isLocalImageFile("https://example.com/image.png")).toBe(false);
      expect(isLocalImageFile("http://example.com/image.png")).toBe(false);
    });

    it("should return false for data URIs", () => {
      expect(isLocalImageFile("data:image/png;base64,abc123")).toBe(false);
    });

    it("should return true for existing local image files", () => {
      const tmpFile = join(tmpdir(), "test-local-image.png");
      writeFileSync(tmpFile, "fake-png");
      expect(isLocalImageFile(tmpFile)).toBe(true);
      unlinkSync(tmpFile);
    });

    it("should return false for non-existent files", () => {
      expect(isLocalImageFile("/tmp/nonexistent-image-123456.png")).toBe(false);
    });

    it("should return false for non-image files", () => {
      const tmpFile = join(tmpdir(), "test-file.txt");
      writeFileSync(tmpFile, "text");
      expect(isLocalImageFile(tmpFile)).toBe(false);
      unlinkSync(tmpFile);
    });
  });

  describe("fileToBase64", () => {
    it("should convert a file to base64 data URI", () => {
      const tmpFile = join(tmpdir(), "test-b64.png");
      writeFileSync(tmpFile, "test-data");

      const result = fileToBase64(tmpFile);
      expect(result).toMatch(/^data:image\/png;base64,/);
      expect(result).toContain(Buffer.from("test-data").toString("base64"));

      unlinkSync(tmpFile);
    });

    it("should detect MIME type from extension", () => {
      const tmpFile = join(tmpdir(), "test-b64.jpg");
      writeFileSync(tmpFile, "test-data");

      const result = fileToBase64(tmpFile);
      expect(result).toMatch(/^data:image\/jpeg;base64,/);

      unlinkSync(tmpFile);
    });
  });

  describe("convertImageValue", () => {
    it("should return URLs unchanged", () => {
      expect(convertImageValue("https://example.com/img.png")).toBe("https://example.com/img.png");
    });

    it("should return data URIs unchanged", () => {
      const dataUri = "data:image/png;base64,abc";
      expect(convertImageValue(dataUri)).toBe(dataUri);
    });

    it("should convert local image files to base64", () => {
      const tmpFile = join(tmpdir(), "test-convert.png");
      writeFileSync(tmpFile, "data");

      const result = convertImageValue(tmpFile);
      expect(result).toMatch(/^data:image\/png;base64,/);

      unlinkSync(tmpFile);
    });

    it("should handle arrays of values", () => {
      const result = convertImageValue(["https://example.com/a.png", "https://example.com/b.png"]);
      expect(result).toEqual(["https://example.com/a.png", "https://example.com/b.png"]);
    });

    it("should pass through non-string, non-array values", () => {
      expect(convertImageValue(42)).toBe(42);
      expect(convertImageValue(true)).toBe(true);
      expect(convertImageValue(null)).toBe(null);
    });
  });

  describe("processImageParams", () => {
    it("should process image params in request body", () => {
      const body = {
        prompt: "test",
        image: "https://example.com/img.png",
        size: "1280*720",
      };

      const result = processImageParams(body);
      expect(result.prompt).toBe("test");
      expect(result.image).toBe("https://example.com/img.png");
      expect(result.size).toBe("1280*720");
    });

    it("should not modify non-image params", () => {
      const body = { prompt: "test", duration: 5 };
      const result = processImageParams(body);
      expect(result).toEqual(body);
    });

    it("should process elements with image fields", () => {
      const body = {
        prompt: "test",
        elements: [{ frontal_image: "https://example.com/face.png", text: "character" }],
      };

      const result = processImageParams(body);
      expect((result.elements as Record<string, unknown>[])[0].frontal_image).toBe(
        "https://example.com/face.png",
      );
      expect((result.elements as Record<string, unknown>[])[0].text).toBe("character");
    });

    it("should create a new object (not mutate input)", () => {
      const body = { prompt: "test", image: "https://example.com/img.png" };
      const result = processImageParams(body);
      expect(result).not.toBe(body);
    });
  });
});

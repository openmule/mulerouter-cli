# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.3] - 2026-05-28

### Fixed
- `klingai/kling-v3-omni-v2v` and `kling-v3-omni-v2v-edit`: `video` parameter is a single URL string, not a JSON array of objects. Removed nonexistent `first_frame` / `last_frame` parameters on v2v (upstream `additionalProperties: false` rejects them) and added the missing `keep_audio` boolean on both. Verified end-to-end against `api.mulerouter.ai`; full regression now 33/34 (vs. 25/34 prior).

## [0.4.2] - 2026-05-27

### Fixed
- `alibaba/wan2.1-vace-plus`: aligned endpoint with the `VideoEditPayload` union schema.
- `minimax/speech`: place `output_format` at the body root instead of nested under `audio_setting`.

### Docs
- `alibaba/wan2.1-vace-plus`: note that Bailian requires `obj_or_bg` even for a single image.

## [0.3.2] - 2026-05-18

### Fixed
- Published `mulerouter` CLI tarball previously shipped `"@mulerouter/core": "workspace:*"` because `npm publish` does not rewrite the workspace protocol. Installers (`npm`, `bun`, `yarn`) failed to resolve the dependency. Publish workflow now rewrites `workspace:*` to `^<version>` before publishing.

## [0.3.1] - 2026-05-18

### Changed
- `MULEROUTER_SITE` is now optional and defaults to `mulerouter`
- CI restructured: single bun job for lint/typecheck/build/test, separate Node 18/20/22 smoke matrix on built artifacts
- Publish workflow split into build + manual-approval publish jobs using npm Trusted Publishing (no NPM_TOKEN required)
- Publish workflow verifies tag matches package versions before publishing

## [0.3.0] - 2026-05-15

### Added
- `status` command for checking async task status (`mulerouter status <api-path> <task-id>`)
- `--wait` flag on status command for polling until task completion
- `--no-wait` output now shows follow-up `status` commands for easy copy-paste
- `--key=value` syntax support for unknown CLI options (in addition to `--key value`)
- GitHub Actions CI workflow (lint, typecheck, build, test on bun; smoke tests on Node 18/20/22)
- GitHub Actions publish workflow (npm publish with provenance on release)
- npm publish provenance support for supply-chain transparency

### Changed
- Happy Horse 1.0 models restricted to mulerun only (no longer available on mulerouter)
- Upgraded to Biome 2.x for linting/formatting
- Upgraded to Commander 14.x
- Image path validation now includes `mask` parameter
- Image file size limited to 20MB
- API client retry logic improved: `Retry-After` header support, reliable abort-during-retry
- API key display in `config` command now shows fewer characters for better security
- Removed `dotenv` runtime dependency (was unused)

### Removed
- OpenAI Sora2 endpoints (model delisted)

## [0.2.0] - 2026-05-15

### Added
- OpenAI GPT Image 2 endpoints: text-to-image generation and image editing (mulerouter only)
- Alibaba Happy Horse 1.0 endpoints: text-to-video and image-to-video generation
- Total endpoint count increased from 34 to 37

### Changed
- **BREAKING**: KlingAI models restructured from grouped model IDs to flat model IDs
  - `klingai/kling-v3/text-to-video` → `klingai/kling-v3-t2v`
  - `klingai/kling-v3/image-to-video` → `klingai/kling-v3-i2v`
  - `klingai/kling-v3-omni/text-to-video` → `klingai/kling-v3-omni-t2v`
  - `klingai/kling-v3-omni/image-to-video` → `klingai/kling-v3-omni-i2v`
  - `klingai/kling-v3-omni/reference-to-video` → `klingai/kling-v3-omni-ref2v`
  - `klingai/kling-v3-omni/video-to-video` → `klingai/kling-v3-omni-v2v`
  - `klingai/kling-v3-omni/video-edit` → `klingai/kling-v3-omni-v2v-edit`
- KlingAI `multi_shot` parameter changed from boolean to string enum (`"false"`/`"true"`)
- MiniMax models availability narrowed to mulerun only (matching API availability)
- Build toolchain switched from pnpm to bun
- Added `bunfig.toml` with 7-day `minimumReleaseAge` for supply-chain security

## [0.1.2] - 2026-04-21

### Fixed
- `--no-wait` flag now works correctly (Commander.js option name mapping)
- MiniMax Speech models send correct `prompt` field (was incorrectly mapped to `text`)
- Missing required parameters show friendly error instead of stack trace
- Invalid `--extra` format shows friendly error instead of stack trace
- `--poll-interval` and `--max-wait` reject non-numeric and negative values
- Enum parameter values validated client-side before sending to API
- Integer/number parameters reject non-numeric input client-side
- Empty required string parameters rejected client-side
- Invalid `--provider`/`--output-type` in `list` command now shows warning with valid options
- Non-existent local image file paths now show a warning
- Path traversal security fix in image validation (`/home/user` no longer matches `/home/userfiles`)

### Changed
- Model files reorganized from flat per-provider to `models/{vendor}/{model-id}.ts`
- MiniMax shared builders extracted to `models/minimax/_builders.ts`
- `toCliFlag()` utility extracted for consistent parameter name formatting
- `validateRequired` now runs before image processing for better error ordering
- User-Agent version injected at build time via tsup (no longer hardcoded)
- Removed unused `zod` and `msw` dependencies
- Standardized all model exports to named exports
- Library entry point (`dist/index.js`) added for programmatic usage

## [0.1.1] - 2026-04-21

### Fixed
- HTTP client timeout cleanup via `finally` block (prevents timer leaks)
- AbortController properly aborted before retry attempts
- Unsafe `as string` type assertions replaced with `String()` runtime conversion
- Path separator uses `path.sep` for Windows compatibility

## [0.1.0] - 2026-04-21

### Added
- Initial release
- 34 model endpoints across 6 providers (Alibaba, Google, KlingAI, Midjourney, MiniMax, OpenAI)
- CLI commands: `list`, `params`, `run`, `config`
- Automatic task polling with progress display
- Local image file auto-conversion to base64
- Exponential backoff retry on transient HTTP errors
- JSON output mode for all commands
- Progressive disclosure help system
- Security: image path validation blocks sensitive directories

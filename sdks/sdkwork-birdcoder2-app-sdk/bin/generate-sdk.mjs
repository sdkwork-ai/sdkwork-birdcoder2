#!/usr/bin/env node
/**
 * Regenerate the BirdCoder2 App API TypeScript SDK family.
 *
 * Usage:
 *   node sdks/sdkwork-birdcoder2-app-sdk/bin/generate-sdk.mjs
 *
 * The OpenAPI authority in `openapi/` is the source of truth; the generated
 * transport under `<family>-typescript/generated/server-openapi` is never edited
 * by hand. `sdk-manifest.json` and the composed facade beside the transport are
 * the consumer surface the H5 application imports.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FAMILY_ROOT = path.resolve(SCRIPT_DIR, "..");
const SDK_NAME = path.basename(FAMILY_ROOT);

const SDK_VERSION = process.env.SDK_VERSION || "0.1.0";
const BASE_URL = process.env.SDK_BASE_URL || "http://localhost:18096";
const PACKAGE_NAME = "@sdkwork/birdcoder2-app-sdk";
const CLIENT_NAME = "SdkworkBirdcoder2AppClient";
const API_PREFIX = "/app/v3/api";

/** Walks up from the family root until it finds the canonical generator. */
function resolveGeneratorEntry() {
  let current = FAMILY_ROOT;
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(current, "sdkwork-sdk-generator", "bin", "sdkgen.js");
    if (fs.existsSync(candidate)) return candidate;
    current = path.resolve(current, "..");
  }
  return null;
}

function fail(message) {
  console.error(`sdkwork-birdcoder2-app-sdk: ${message}`);
  process.exit(1);
}

const inputPath = path.join(FAMILY_ROOT, "openapi", "sdkwork-birdcoder2-app-api.sdkgen.json");
const outputPath = path.join(
  FAMILY_ROOT,
  `${SDK_NAME}-typescript`,
  "generated",
  "server-openapi",
);

const generatorEntry = resolveGeneratorEntry();
if (!generatorEntry) {
  fail("canonical SDK generator not found (sdkwork-sdk-generator/bin/sdkgen.js)");
}
if (!fs.existsSync(inputPath)) {
  fail(`OpenAPI generation input not found: ${path.relative(FAMILY_ROOT, inputPath)}`);
}

// The generated transport is entirely generator-owned, so a stale tree must not
// survive a rename or a removed operation.
fs.rmSync(outputPath, { recursive: true, force: true });

const args = [
  generatorEntry,
  "generate",
  "-i",
  inputPath,
  "-o",
  outputPath,
  "-n",
  SDK_NAME,
  "-t",
  "app",
  "-l",
  "typescript",
  "--fixed-sdk-version",
  SDK_VERSION,
  "--base-url",
  BASE_URL,
  "--api-prefix",
  API_PREFIX,
  "--package-name",
  PACKAGE_NAME,
  "--client-name",
  CLIENT_NAME,
  "--standard-profile",
  "sdkwork-v3",
  "--sdk-root",
  FAMILY_ROOT,
  "--sdk-name",
  SDK_NAME,
  "--no-sync-published-version",
];

console.log(`generating typescript SDK -> ${path.relative(FAMILY_ROOT, outputPath)}`);
const result = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(result.status ?? 1);

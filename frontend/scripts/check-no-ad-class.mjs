#!/usr/bin/env node
/**
 * Pre-commit guard: FAIL if any frontend source file contains a CSS
 * class name that begins with `ad-` or `ads-`. Such classes get
 * `display: none !important` by most ad blockers (uBlock Origin,
 * AdBlock Plus) because their filter lists include rules like
 * `[class^="ad-"]` and `[class*="ad-"]`.
 *
 * This is the root-cause fix of the historical 3rd-level-ads bug
 * (see commit d720fa2 and MEMORY.md). The rename from `ad-row` to
 * `creative-row` solved the production incident; this script
 * prevents regressions.
 *
 * Usage:
 *   node frontend/scripts/check-no-ad-class.mjs          # just check
 *   pnpm lint:no-ad-class                                 # via script
 *
 * Allowed exceptions (added to the patterns list below if needed):
 *   - None. If you think you need an ad- class, use a different name.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const FRONTEND_ROOT = resolve(import.meta.dirname, "..");
const SCAN_DIRS = ["src", "tests/unit", "tests/e2e", "index.html"];

// The forbidden patterns we look for (string form inside source files).
// We check for `className="ad-` / `class="ad-` / `\.ad-` / `"ad-` etc.
const PATTERNS = [
  // JSX / HTML class attribute containing an ad-* or ads-* class
  /class(Name)?\s*=\s*["'`][^"'`]*\bad[-_]/,
  /class(Name)?\s*=\s*["'`][^"'`]*\bads[-_]/,
  // CSS selector for ad-* class
  /\.ad[-_][a-zA-Z]/,
  /\.ads[-_][a-zA-Z]/,
  // cn("ad-row", ...) — arguments to clsx/cn
  /\bcn\s*\(\s*[^)]*["'`]ad[-_]/,
  /\bcn\s*\(\s*[^)]*["'`]ads[-_]/,
];

// Explicit allowlist — filenames (relative to frontend/) that are allowed
// to contain the literal string `ad-row` or `.ad-row` because they document
// the historical bug and MUST retain those examples verbatim.
const ALLOWED_FILES = new Set([
  "scripts/check-no-ad-class.mjs", // this script
]);

const HITS = [];

function walk(rel) {
  const abs = join(FRONTEND_ROOT, rel);
  let stat;
  try {
    stat = statSync(abs);
  } catch {
    return;
  }
  if (stat.isFile()) {
    scanFile(abs, rel);
    return;
  }
  if (stat.isDirectory()) {
    for (const name of readdirSync(abs)) {
      if (name === "node_modules" || name === "dist" || name === "coverage") continue;
      walk(join(rel, name));
    }
  }
}

function scanFile(abs, rel) {
  const relNormalized = rel.replaceAll("\\", "/");
  if (ALLOWED_FILES.has(relNormalized)) return;
  // Only scan relevant file types
  if (!/\.(tsx?|jsx?|mjs|cjs|css|html)$/.test(relNormalized)) return;
  const content = readFileSync(abs, "utf8");
  const lines = content.split("\n");
  lines.forEach((line, idx) => {
    for (const pat of PATTERNS) {
      if (pat.test(line)) {
        HITS.push({ file: relNormalized, line: idx + 1, code: line.trim() });
      }
    }
  });
}

for (const dir of SCAN_DIRS) {
  walk(dir);
}

if (HITS.length > 0) {
  console.error("✘ Forbidden `ad-*` / `ads-*` class name(s) detected:\n");
  for (const hit of HITS) {
    console.error(`  ${hit.file}:${hit.line}`);
    console.error(`    ${hit.code}`);
  }
  console.error(
    "\nAd blockers hide any element whose class starts with `ad-` or `ads-`.",
  );
  console.error(
    "Rename these classes to use `creative-*` or another prefix.",
  );
  console.error("See MEMORY.md (commit d720fa2) for the full bug story.\n");
  process.exit(1);
}

console.log("✔ No forbidden `ad-*` / `ads-*` class names found.");

// @vitest-environment node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");
const scannedExtensions = new Set([".css", ".ts", ".tsx"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) return sourceFiles(path);
    return [...scannedExtensions].some((extension) => path.endsWith(extension)) ? [path] : [];
  });
}

describe("Retro Manga static visual system", () => {
  it("uses the Tailwind 4 CSS entrypoint and keeps custom styles in cascade layers", () => {
    const indexCss = readFileSync(join(sourceRoot, "index.css"), "utf8");

    expect(indexCss).toContain('@import "tailwindcss";');
    expect(indexCss).not.toMatch(/@tailwind\s+(?:base|components|utilities)/);
    expect(indexCss).toMatch(/@layer base\s*\{\s*:root/);
    expect(indexCss).toMatch(/@layer components\s*\{\s*\.neo-title/);
  });

  it("does not use viewport-scaled font sizes or negative letter spacing", () => {
    const violations = sourceFiles(sourceRoot).flatMap((path) => {
      const text = readFileSync(path, "utf8");
      const relativePath = relative(process.cwd(), path);
      const matches = [
        ...text.matchAll(/text-\[clamp\([^\]]*vw[^\]]*\)\]/g),
        ...text.matchAll(/letter-spacing:\s*-[^;]+;/g),
      ];
      return matches.map((match) => `${relativePath}: ${match[0]}`);
    });

    expect(violations).toEqual([]);
  });

  it("does not hard-code the library viewport height against an assumed header height", () => {
    const appShell = readFileSync(join(sourceRoot, "components/layout/AppShell.tsx"), "utf8");
    const indexCss = readFileSync(join(sourceRoot, "index.css"), "utf8");

    expect(appShell).not.toContain("app-library-main neo-dots h-[calc(100vh-80px)]");
    expect(indexCss).not.toMatch(/\.tauri-runtime\s+\.app-library-main\s*\{[^}]*height:/s);
  });

  it("keeps keyboard focus visible and respects reduced-motion preferences", () => {
    const indexCss = readFileSync(join(sourceRoot, "index.css"), "utf8");

    for (const control of ["input", "select", "textarea"]) {
      expect(indexCss).toContain(`${control}:focus-visible`);
    }
    expect(indexCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(indexCss).toContain("outline: 3px solid var(--og-shell-brand) !important");
  });
});

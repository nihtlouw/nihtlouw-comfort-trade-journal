import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryProject = mkdtempSync(join(dirname(project), ".bloom-android-"));
const output = join(project, "out-android");

try {
  for (const file of ["package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "postcss.config.mjs"]) {
    cpSync(join(project, file), join(temporaryProject, file));
  }
  cpSync(join(project, "src"), join(temporaryProject, "src"), { recursive: true });
  if (existsSync(join(project, "public"))) {
    cpSync(join(project, "public"), join(temporaryProject, "public"), { recursive: true });
  }
  symlinkSync(
    join(project, "node_modules"),
    join(temporaryProject, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );

  // Capacitor offline-first APK bundles static UI assets with localStorage + IndexedDB.
  rmSync(join(temporaryProject, "src", "app", "api"), { recursive: true, force: true });
  writeFileSync(
    join(temporaryProject, "src", "app", "page.tsx"),
    [
      'import { PagesJournal } from "@/components/pages-journal";',
      "",
      "export default function HomePage() {",
      "  return <PagesJournal />;",
      "}",
      "",
    ].join("\n"),
  );

  // Rewrite manifest.webmanifest paths to root-relative "/" for Capacitor https://localhost
  const manifestPath = join(temporaryProject, "public", "manifest.webmanifest");
  if (existsSync(manifestPath)) {
    const rawManifest = readFileSync(manifestPath, "utf8");
    writeFileSync(manifestPath, rawManifest.replaceAll("/nihtlouw-comfort-trade-journal/", "/"));
  }

  const cleanEnv = { ...process.env, NEXT_PUBLIC_ANDROID_CAPACITOR: "true", NEXT_TELEMETRY_DISABLED: "1" };
  delete cleanEnv.NEXT_PUBLIC_GITHUB_PAGES;

  execFileSync(
    process.execPath,
    [join(project, "node_modules", "next", "dist", "bin", "next"), "build", "--webpack"],
    {
      cwd: temporaryProject,
      stdio: "inherit",
      env: cleanEnv,
    },
  );

  const builtSite = join(temporaryProject, "out");
  if (!existsSync(join(builtSite, "index.html"))) {
    throw new Error("Android web build did not produce index.html.");
  }
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  cpSync(builtSite, output, { recursive: true });
  console.log(`Capacitor Android web bundle ready at ${output}`);
} finally {
  rmSync(temporaryProject, { recursive: true, force: true });
}

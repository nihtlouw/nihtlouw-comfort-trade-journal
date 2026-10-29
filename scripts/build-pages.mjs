import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Stay on the project's drive so Next's Windows webpack paths remain valid.
const temporaryProject = mkdtempSync(join(dirname(project), ".bloom-pages-"));
const output = join(project, "out");

try {
  for (const file of ["package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "postcss.config.mjs"]) {
    cpSync(join(project, file), join(temporaryProject, file));
  }
  cpSync(join(project, "src"), join(temporaryProject, "src"), { recursive: true });
  if (existsSync(join(project, "public"))) {
    cpSync(join(project, "public"), join(temporaryProject, "public"), { recursive: true });
  }
  symlinkSync(join(project, "node_modules"), join(temporaryProject, "node_modules"), process.platform === "win32" ? "junction" : "dir");

  // Pages has no Node.js runtime. Only the temporary copy loses its API routes.
  rmSync(join(temporaryProject, "src", "app", "api"), { recursive: true, force: true });
  writeFileSync(join(temporaryProject, "src", "app", "page.tsx"), [
    'import { PagesJournal } from "@/components/pages-journal";',
    "",
    "export default function HomePage() {",
    "  return <PagesJournal />;",
    "}",
    "",
  ].join("\n"));

  // Use Next's supported webpack builder with dependencies shared from the source
  // project. No .env files or database credentials enter this temporary build.
  execFileSync(process.execPath, [join(project, "node_modules", "next", "dist", "bin", "next"), "build", "--webpack"], {
    cwd: temporaryProject,
    stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_GITHUB_PAGES: "true", NEXT_TELEMETRY_DISABLED: "1" },
  });
  const builtSite = join(temporaryProject, "out");
  if (!existsSync(join(builtSite, "index.html"))) throw new Error("Pages build did not produce index.html.");
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  cpSync(builtSite, output, { recursive: true });
  writeFileSync(join(output, ".nojekyll"), "");
  console.log(`GitHub Pages site built at ${output}`);
} finally {
  rmSync(temporaryProject, { recursive: true, force: true });
}
// Build a SAGE platform release into <repository>/release/<version>/ (outside app/dist, which every
// build cleans):
//   SAGE-<version>-windows-x64.exe   the installer (NSIS, unsigned)
//   SHA256SUMS.txt, RELEASE.md
// Steps: version check, frozen backend + desktop + installer, then the packaged smoke test.
// Device plugins are released on their own: python plugin/tools/pack.py <plugin> -> .sagedev.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = fileURLToPath(new URL("..", import.meta.url));
const repository = resolve(workspace, "..");
const dist = resolve(workspace, "dist");
const version = JSON.parse(await readFile(resolve(workspace, "apps/desktop/package.json"), "utf8")).version;
const release = resolve(repository, "release", version);

function run(command, args, options = {}) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32", ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
}

const sha256 = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");

run("node", ["scripts/check-version.mjs"], { cwd: workspace });
await rm(release, { recursive: true, force: true });
await mkdir(release, { recursive: true });

run("pnpm", ["package:win"], { cwd: workspace });
run("node", ["scripts/smoke-packaged.mjs"], { cwd: resolve(workspace, "apps/desktop") });

const installer = `SAGE-${version}-windows-x64.exe`;
await copyFile(resolve(dist, installer), resolve(release, installer));
const files = [installer];
const sums = await Promise.all(files.map(async (name) => `${await sha256(resolve(release, name))}  ${name}`));
await writeFile(resolve(release, "SHA256SUMS.txt"), sums.join("\n") + "\n");

const changelog = await readFile(resolve(repository, "CHANGELOG.md"), "utf8");
const section = changelog.split(/^## /m).find((part) => part.startsWith(`${version} `) || part.startsWith(`${version}\n`));
const notes = await readFile(resolve(workspace, "scripts/release-notes.md"), "utf8");
await writeFile(resolve(release, "RELEASE.md"), notes
  .replaceAll("{{version}}", version)
  .replace("{{installer}}", installer)
  .replace("{{changes}}", section ? section.slice(section.indexOf("\n") + 1).trim() : "（见 CHANGELOG.md）"));
console.log(`\nRelease ${version} in ${release}:\n${files.map((name) => `  ${basename(name)}`).join("\n")}`);

// The platform and the device plugins only meet through the SDK:  app -> sdk <- plugin.
//   1. Platform code (app/**, not its tests) never names a product plugin's device type.
//   2. Nothing in app/ depends on a product plugin package (sage_plugin_* / sage-plugin-*);
//      the platform's tests use the SDK's demo plugin (sdk/demo_plugin) instead.
//   3. Plugins and the SDK never reach into the platform (sage_backend, @sage/*).
//   4. The SDK (tests included) never names a product plugin; it tests itself with sdk/demo_plugin.
// Product plugins are the folders under plugin/ that have a pyproject.toml.
import { readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = fileURLToPath(new URL("..", import.meta.url));
const repository = resolve(workspace, "..");
const excluded = new Set(["node_modules", ".venv", "venv", "dist", "out", "build", "__pycache__", ".pytest_cache",
  ".ruff_cache", ".mypy_cache", ".git", "run", "logs", "coverage", "output"]);
const text = /\.(?:[cm]?[jt]sx?|py|json|toml|ya?ml|ps1|spec)$/i;
const test = /(?:^|[\\/])(?:tests?|e2e)[\\/]|\.test\.[cm]?[jt]sx?$|\.fixture\.[jt]s$/;

// Platform code that names a product plugin on purpose, with the reason. Keep this list empty when possible.
const allowed = new Map([]);

const plugins = [];
for (const entry of await readdir(resolve(repository, "plugin"), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  try {
    await readFile(resolve(repository, "plugin", entry.name, "pyproject.toml"));
    plugins.push(entry.name);
  } catch { /* not a plugin folder (tools, dist) */ }
}
const names = plugins.map((name) => name.replace(/[_-]/g, "[_-]")).join("|");
const deviceType = new RegExp(`["'\`](?:${plugins.join("|")})["'\`]`);
const pluginPackage = new RegExp(`sage[_-]plugin[_-](?:${names})\\b`);
const platform = /\bsage_backend\b|@sage\//;

async function* files(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name.endsWith(".egg-info") || entry.isSymbolicLink()) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (text.test(entry.name)) yield path;
  }
}

const violations = [];
const report = (path, rule) => violations.push(`${relative(repository, path).split(sep).join("/")}: ${rule}`);

for await (const path of files(workspace)) {
  const name = relative(repository, path).split(sep).join("/");
  if (name.endsWith("pnpm-lock.yaml") || name.endsWith("uv.lock")) continue;
  const content = await readFile(path, "utf8");
  if (pluginPackage.test(content)) report(path, "depends on a product plugin package; use the SDK demo plugin");
  if (!test.test(name) && !allowed.has(name) && deviceType.test(content)) report(path, "platform code names a product device type");
}
for (const root of ["plugin", "sdk"]) {
  for await (const path of files(resolve(repository, root))) {
    const content = await readFile(path, "utf8");
    if (platform.test(content)) report(path, "reaches into the platform (sage_backend / @sage/*)");
    if (root === "sdk" && (pluginPackage.test(content) || deviceType.test(content))) {
      report(path, "the SDK names a product plugin; use the demo plugin (sdk/demo_plugin)");
    }
  }
}
if (violations.length) throw new Error(`Plugin boundary violations:\n${violations.join("\n")}`);
console.log(`Plugin boundary verified: app -> sdk <- plugin (${plugins.length} plugins, ${allowed.size} allowed exceptions).`);

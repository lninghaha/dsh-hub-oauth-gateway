#!/usr/bin/env node
/**
 * Inspect or locally pack a release artifact.
 *
 * This helper never changes versions, commits, tags, pushes, publishes, reads
 * user credentials, or restarts DSH Web.
 */
import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "output");
const knownFlags = new Set(["--dry-run", "--pack", "--help"]);
const args = new Set(process.argv.slice(2));

for (const argument of args) {
	if (!knownFlags.has(argument)) {
		console.error(`Unknown option: ${argument}`);
		process.exit(2);
	}
}
if (args.has("--dry-run") && args.has("--pack")) {
	console.error("Choose either --dry-run or --pack, not both.");
	process.exit(2);
}
if (args.has("--help")) {
	console.log(`dsh-hub-oauth-gateway release inspector

Usage:
  pnpm run release:inspect   Verify metadata, artifacts, and the npm file manifest
  pnpm run release:pack      Rebuild, verify, and write a local tarball to output/

Neither mode changes versions, Git state, tags, remotes, registries, credentials,
or the running DSH Web service.`);
	process.exit(0);
}

const mode = args.has("--pack") ? "pack" : "dry-run";
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
const readme = await readFile(join(root, "README.md"), "utf8");
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

function fail(message) {
	throw new Error(message);
}

function run(command, commandArgs, options = {}) {
	let executable = command;
	let args = commandArgs;
	if (process.platform === "win32" && command === "pnpm") {
		const pnpmCli =
			process.env.npm_execpath ??
			(process.env.APPDATA === undefined
				? undefined
				: resolve(process.env.APPDATA, "npm/node_modules/pnpm/bin/pnpm.cjs"));
		if (pnpmCli === undefined) fail("pnpm CLI path is unavailable on Windows");
		executable = process.execPath;
		args = [pnpmCli, ...commandArgs];
	} else if (process.platform === "win32" && command === "npm") {
		executable = process.execPath;
		args = [resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"), ...commandArgs];
	}
	const result = spawnSync(executable, args, {
		cwd: root,
		encoding: "utf8",
		stdio: options.capture === true ? ["ignore", "pipe", "pipe"] : "inherit",
	});
	if (result.error !== undefined) throw result.error;
	if (result.status !== 0) {
		const details = options.capture === true ? `${result.stderr ?? ""}${result.stdout ?? ""}`.trim() : "";
		fail(`${command} ${commandArgs.join(" ")} failed${details === "" ? "" : `:\n${details}`}`);
	}
	return result.stdout ?? "";
}

if (manifest.name !== "dsh-hub-oauth-gateway") fail(`unexpected package name: ${String(manifest.name)}`);
if (typeof manifest.version !== "string" || !semver.test(manifest.version)) {
	fail(`package version is not valid SemVer: ${String(manifest.version)}`);
}
if (manifest.private === true) fail("release package must not be private");
if (manifest.license !== "MIT" && manifest.license !== "MIT AND Apache-2.0") {
	fail(`package license must be MIT or MIT AND Apache-2.0; found ${String(manifest.license)}`);
}
if (manifest.publishConfig?.access !== "public") fail("publishConfig.access must be public");
if (manifest.publishConfig?.registry !== "https://registry.npmjs.org/") {
	fail("publishConfig.registry must explicitly target the public npm registry");
}

const releaseVersions = [
	...changelog.matchAll(/^##\s+(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)\s*$/gmu),
].map((match) => match[1]);
if (releaseVersions[0] !== manifest.version) {
	fail(
		`latest CHANGELOG release (${releaseVersions[0] ?? "missing"}) does not match package version ${manifest.version}`,
	);
}
if (!readme.includes(manifest.version)) fail(`README.md does not mention release ${manifest.version}`);

const readmeLocales = [
	"README.zh-CN.md",
	"README.ja.md",
	"README.ko.md",
	"README.pt-BR.md",
	"README.es.md",
	"README.fr.md",
	"README.de.md",
	"README.ru.md",
];
for (const localeFile of readmeLocales) {
	const localeText = await readFile(join(root, localeFile), "utf8");
	if (!localeText.includes(manifest.version)) {
		fail(`${localeFile} does not mention release ${manifest.version}`);
	}
}

const expectedAllowlist = [
	"lib/",
	"cordis.patch.yml",
	"scripts/install.mjs",
	"README.md",
	"README.zh-CN.md",
	"README.ja.md",
	"README.ko.md",
	"README.pt-BR.md",
	"README.es.md",
	"README.fr.md",
	"README.de.md",
	"README.ru.md",
	"CHANGELOG.md",
	"LICENSE",
	"NOTICE",
	"LICENSES/Apache-2.0.txt",
	".github/CONTRIBUTING.md",
	".github/CODE_OF_CONDUCT.md",
	".github/SECURITY.md",
	"docs/00-project-rules.md",
	"docs/01-install.md",
	"docs/oauth-provenance.md",
	"docs/02-architecture.md",
	"docs/02-architecture.zh-CN.md",
	"docs/03-configuration.md",
	"docs/04-migration-v1.md",
	"docs/research/usage-analytics-landscape.md",
	"docs/research/token-monitor.md",
	"docs/research/token-monitor-supplement-proposal.md",
	"docs/research/ccswitch-provider-usage.md",
	"compatibility/dsh-bom.json",
];
const actualAllowlist = manifest.files;
if (!Array.isArray(actualAllowlist)) fail("package.json files must be an explicit array");
for (const entry of actualAllowlist) {
	if (typeof entry !== "string") fail("package.json files entries must be strings");
	if (/[*?[\]{}]/u.test(entry)) fail(`package files entry must not use a glob: ${entry}`);
	if ((entry.startsWith("docs/") || entry.startsWith(".github/")) && !expectedAllowlist.includes(entry)) {
		fail(`publishable documentation must be listed explicitly: ${entry}`);
	}
}
if (JSON.stringify(actualAllowlist) !== JSON.stringify(expectedAllowlist)) {
	fail("package.json files allowlist differs from the reviewed release allowlist");
}

if (mode === "pack") run("pnpm", ["run", "release:build"]);
else run("pnpm", ["run", "release:verify"]);

const dryRunOutput = run("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { capture: true });
let dryRunReport;
try {
	dryRunReport = JSON.parse(dryRunOutput);
} catch (error) {
	throw new Error("npm pack --dry-run returned invalid JSON", { cause: error });
}
const report = Array.isArray(dryRunReport) ? dryRunReport[0] : undefined;
if (report === undefined || !Array.isArray(report.files)) fail("npm pack did not return a file manifest");

const packedFiles = report.files.map((entry) => entry.path).sort();
const packed = new Set(packedFiles);
for (const required of [
	"package.json",
	"README.md",
	"README.zh-CN.md",
	"docs/01-install.md",
	"LICENSE",
	"CHANGELOG.md",
	".github/CONTRIBUTING.md",
	".github/CODE_OF_CONDUCT.md",
	".github/SECURITY.md",
	"NOTICE",
	"LICENSES/Apache-2.0.txt",
	"docs/00-project-rules.md",
	"docs/02-architecture.md",
	"docs/03-configuration.md",
	"docs/04-migration-v1.md",
	"cordis.patch.yml",
	"scripts/install.mjs",
	"compatibility/dsh-bom.json",
	"lib/index.js",
	"lib/index.d.ts",
	"lib/client.js",
]) {
	if (!packed.has(required)) fail(`packed release is missing ${required}`);
}

const forbiddenPatterns = [
	/(?:^|\/)docs\/local(?:\/|$)/u,
	/(?:^|\/)reference(?:\/|$)/u,
	/(?:^|\/)(?:src|tests|build|\.next|output|coverage)(?:\/|$)/u,
	// Allow only the three publishable governance docs under .github/
	/(?:^|\/)\.github\/(?!CONTRIBUTING\.md$|CODE_OF_CONDUCT\.md$|SECURITY\.md$).+/u,
	/(?:^|\/)node_modules(?:\/|$)/u,
	/(?:^|\/)(?:AGENTS\.md|package-lock\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/u,
	/(?:^|\/)\.env(?:\.|$)/u,
	/\.(?:sqlite|sqlite3|db|tgz)$/u,
];
const forbiddenFiles = packedFiles.filter((path) => forbiddenPatterns.some((pattern) => pattern.test(path)));
if (forbiddenFiles.length > 0) fail(`packed release contains forbidden files:\n${forbiddenFiles.join("\n")}`);

for (const markdownPath of packedFiles.filter((path) => path.endsWith(".md"))) {
	const markdown = await readFile(join(root, markdownPath), "utf8");
	for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
		const reference = match[1]?.trim().split(/\s+"/u, 1)[0] ?? "";
		if (reference === "" || reference.startsWith("#") || /^(?:https?:|mailto:)/u.test(reference)) continue;
		let target;
		try {
			target = decodeURIComponent(reference.split(/[?#]/u, 1)[0] ?? "");
		} catch {
			fail(`packed Markdown contains an invalid encoded link in ${markdownPath}: ${reference}`);
		}
		const resolvedTarget = posix.normalize(posix.join(posix.dirname(markdownPath), target));
		if (!packed.has(resolvedTarget)) {
			fail(`packed Markdown link leaves or misses the artifact: ${markdownPath} -> ${reference}`);
		}
	}
}

const sensitiveContentPatterns = [
	{ label: "private-key material", pattern: /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/u },
	{ label: "GitHub token", pattern: /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/u },
	{ label: "provider-style secret", pattern: /\bsk-[A-Za-z0-9_-]{32,}\b/u },
	{
		label: "personal POSIX home path",
		pattern: /\/home\/(?!user(?:\/|\b)|example(?:\/|\b)|runner(?:\/|\b))[A-Za-z0-9._-]+\//u,
	},
	{ label: "personal Windows home path", pattern: /[A-Za-z]:\\Users\\(?!User\\|user\\|example\\)[^\\\r\n]+\\/u },
];
for (const path of packedFiles) {
	if (!/\.(?:c?js|mjs|json|md|ts|map|ya?ml)$/u.test(path) && path !== "LICENSE") continue;
	const content = await readFile(join(root, path), "utf8");
	for (const { label, pattern } of sensitiveContentPatterns) {
		if (pattern.test(content)) fail(`packed release may contain ${label}: ${path}`);
	}
}

console.log(`Verified ${manifest.name}@${manifest.version}`);
console.log(`Packed files: ${packedFiles.length}`);
for (const path of packedFiles) console.log(`  ${path}`);

if (mode === "dry-run") {
	console.log("Inspection complete. No version, Git, registry, service, or tarball changes were made.");
	process.exit(0);
}

const staging = join(output, `.pack-${process.pid}`);
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
try {
	const packOutput = run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", staging], {
		capture: true,
	});
	let packReport;
	try {
		packReport = JSON.parse(packOutput);
	} catch (error) {
		throw new Error("npm pack returned invalid JSON", { cause: error });
	}
	const filename = Array.isArray(packReport) ? packReport[0]?.filename : undefined;
	if (typeof filename !== "string" || filename.length === 0) fail("npm pack did not report a tarball filename");
	const source = join(staging, filename);
	await access(source);
	await mkdir(output, { recursive: true });
	const target = join(output, `${manifest.name}-${manifest.version}.tgz`);
	await rm(target, { force: true });
	await rename(source, target);
	console.log(`Wrote ${target}`);
} finally {
	await rm(staging, { recursive: true, force: true });
}

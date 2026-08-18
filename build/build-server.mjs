import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const externalPlugin = {
	name: "dsh-host-externals",
	setup(buildApi) {
		buildApi.onResolve({ filter: /^(@deepseek-ai\/|@earendil-works\/)/ }, ({ path }) => ({
			path,
			external: true,
		}));
	},
};

// Some sources use explicit `.ts` specifiers. esbuild cannot resolve those on
// its own, so hand the real .ts file back (it lands in the bundle; types still
// come from tsc's declaration emit).
const tsSpecifierPlugin = {
	name: "dsh-ts-specifiers",
	setup(buildApi) {
		buildApi.onResolve({ filter: /^\..*\.ts$/ }, ({ path, resolveDir }) => ({
			path: resolve(resolveDir, path),
		}));
	},
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = resolve(root, ".next/lib");
const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

const REQUIRE_BANNER =
	'import { createRequire as __dshCreateRequire } from "node:module";\n' +
	"const require = __dshCreateRequire(import.meta.url);";

const shared = {
	bundle: true,
	format: "esm",
	platform: "node",
	target: "node22.19",
	sourcemap: "external",
	sourcesContent: true,
	legalComments: "none",
	metafile: true,
	plugins: [externalPlugin, tsSpecifierPlugin],
};

await mkdir(outdir, { recursive: true });

const index = await build({
	...shared,
	entryPoints: [resolve(root, "src/index.ts")],
	outfile: resolve(outdir, "index.js"),
	banner: {
		js: `${REQUIRE_BANNER}\n/** ${manifest.name} ${manifest.version} standalone server bundle */`,
	},
});
const bin = await build({
	...shared,
	entryPoints: [resolve(root, "src/cli/coding-oauth.ts")],
	outfile: resolve(outdir, "bin.js"),
	banner: {
		js: `${REQUIRE_BANNER}\n/** ${manifest.name} coding OAuth CLI bundle */`,
	},
});
const invariant = await build({
	...shared,
	entryPoints: [resolve(root, "src/server/coding-oauth/invariant.ts")],
	outfile: resolve(outdir, "invariant.js"),
	banner: { js: `/** ${manifest.name} invariant entry */` },
});
await writeFile(
	resolve(outdir, "server.meta.json"),
	JSON.stringify({ index: index.metafile, bin: bin.metafile, invariant: invariant.metafile }, null, 2),
);
try {
	await cp(resolve(outdir, "server/coding-oauth/invariant.d.ts"), resolve(outdir, "invariant.d.ts"));
	await cp(resolve(outdir, "server/coding-oauth/invariant.d.ts.map"), resolve(outdir, "invariant.d.ts.map"));
} catch {
	// Declaration emit is required for release verify after a full typecheck.
}
console.log(`built ${outdir}/{index,bin,invariant}.js`);

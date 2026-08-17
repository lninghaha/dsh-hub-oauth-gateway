import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = resolve(root, ".next/lib");
const outfile = resolve(outdir, "index.js");
const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

await mkdir(outdir, { recursive: true });
const result = await build({
	entryPoints: [resolve(root, "src/index.ts")],
	outfile,
	bundle: true,
	format: "esm",
	platform: "node",
	target: "node22.19",
	sourcemap: "external",
	sourcesContent: true,
	legalComments: "none",
	metafile: true,
	packages: "bundle",
	banner: {
		js: `/** dsh-hub-oauth-gateway ${manifest.version} standalone server bundle */`,
	},
});
await writeFile(resolve(outdir, "server.meta.json"), JSON.stringify(result.metafile, null, 2));
console.log(`built ${outfile}`);

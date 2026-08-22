import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, context } from "esbuild";
import { transform } from "lightningcss";
import { readDshClientPlatformContract } from "./dsh-client-platform.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = resolve(root, ".next/lib");
const watch = process.argv.includes("--watch");
const platform = await readDshClientPlatformContract();

const inlineCssPlugin = {
	name: "dsh-inline-css",
	setup(buildApi) {
		buildApi.onLoad({ filter: /\.css$/ }, async ({ path }) => {
			const source = await readFile(path);
			const result = transform({
				filename: path,
				code: source,
				minify: true,
				targets: { chrome: 109 << 16 },
			});
			return {
				contents: `export default ${JSON.stringify(result.code.toString())};`,
				loader: "js",
			};
		});
	},
};

const options = {
	entryPoints: [resolve(root, "src/client/index.tsx")],
	outfile: resolve(outdir, "client.js"),
	bundle: true,
	format: "cjs",
	platform: "browser",
	target: "es2022",
	jsx: "automatic",
	external: [...platform.modules],
	sourcemap: "external",
	sourcesContent: true,
	legalComments: "none",
	minify: !watch,
	metafile: true,
	define: {
		"process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production"),
	},
	banner: {
		js: '(()=>{const loader=globalThis.window?.__ModuleLoader__;if(!loader||typeof loader.load!=="function")throw new Error("dsh client module loader is unavailable or incompatible");loader.load({id:"dsh-hub-oauth-gateway",factory:(require)=>{var module={exports:{}};var exports=module.exports;',
	},
	footer: {
		js: "return module.exports;}});})();",
	},
	plugins: [inlineCssPlugin],
};

await mkdir(outdir, { recursive: true });

if (watch) {
	const buildContext = await context(options);
	await buildContext.watch();
	console.log(`watching ${options.entryPoints[0]} -> ${options.outfile}`);
	await new Promise(() => {});
} else {
	const result = await build(options);
	await writeFile(resolve(outdir, "client.meta.json"), JSON.stringify(result.metafile, null, 2));
	console.log(`built ${options.outfile} against dsh-client-web ${platform.version}`);
}

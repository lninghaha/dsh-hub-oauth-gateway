import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { describe, expect, it } from "vitest";

const allowedRequires = new Set([
	"react",
	"react/jsx-runtime",
	"react-dom",
	"react-dom/client",
	"@deepseek-ai/cordis",
	"@deepseek-ai/dsh-client-ui-slots",
	"@deepseek-ai/dsh-client-web-react",
	"@deepseek-ai/dsh-client-ui-primitives",
	"@deepseek-ai/dsh-client-ui-attachment",
	"@deepseek-ai/dsh-client-schema-form",
]);

describe("generated DSH client bundle", () => {
	it("registers a single classic-script factory with only platform requires", async () => {
		const source = await readFile(resolve(".next/lib/client.js"), "utf8");
		expect(
			source.startsWith(
				'(()=>{const loader=globalThis.window?.__ModuleLoader__;if(!loader||typeof loader.load!=="function")throw new Error("dsh client module loader is unavailable or incompatible");loader.load({id:"dsh-hub-oauth-gateway",factory:(require)=>{',
			),
		).toBe(true);
		expect(source).not.toMatch(/^\s*(?:import|export)\s/m);

		const requires = [...source.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]);
		expect(requires.filter((specifier) => specifier !== undefined && !allowedRequires.has(specifier))).toEqual([]);

		let record: { id: string; factory: (requireModule: (specifier: string) => unknown) => unknown } | undefined;
		const shell = {
			__ModuleLoader__: {
				load(next: typeof record) {
					record = next;
				},
			},
		};
		const previousWindow = globalThis.window;
		Object.defineProperty(globalThis, "window", { configurable: true, value: shell });
		try {
			new Function(source)();
		} finally {
			Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
		}
		expect(record?.id).toBe("dsh-hub-oauth-gateway");

		const exports = record?.factory((specifier) => {
			if (specifier === "react") return React;
			if (specifier === "react/jsx-runtime") return jsxRuntime;
			if (specifier === "react-dom/client")
				return { createRoot: () => ({ render: () => undefined, unmount: () => undefined }) };
			if (specifier === "@deepseek-ai/dsh-client-ui-primitives") return { Modal: () => null };
			throw new Error(`unexpected require: ${specifier}`);
		}) as { apply?: unknown; inject?: unknown };
		expect(typeof exports.apply).toBe("function");
		expect(exports.inject).toEqual(["locale"]);
	});
});

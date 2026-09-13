import type { CredentialProvider } from "@deepseek-ai/dsh-credentials";
import { describe, expect, it, vi } from "vitest";
import {
	createOpenCodeGoConnectionController,
	OPENCODE_GO_API,
	OPENCODE_GO_BASE_URL,
	type OpenCodeGoSettingsProvider,
} from "../../../src/server/coding-oauth/opencode-go-connection.js";

function fixture(provider: Record<string, unknown> = {}, revision = 4) {
	const values = new Map<string, string>();
	const credentials = {
		describe: vi.fn(async (ref: string) => ({
			configured: values.has(String(ref)),
			writable: true,
			source: values.has(String(ref)) ? "store" : null,
		})),
		resolve: vi.fn(async (ref: string) => (values.has(String(ref)) ? { value: values.get(String(ref))! } : undefined)),
		set: vi.fn(async (ref: string, value: string) => {
			values.set(String(ref), value);
		}),
	} as unknown as CredentialProvider;
	const mutate = vi.fn(async () => undefined);
	const settings: OpenCodeGoSettingsProvider = {
		writable: true,
		describe: () => [{ ns: "llm-pi-ai", revision, value: { providers: { "coding-opencode-go": provider } } }],
		mutate,
	};
	return { values, credentials, settings, mutate };
}

const callStatus = () => ({
	active: true,
	lastCall: "no-call" as const,
	httpStatus: "no-call" as const,
	streamStatus: "no-call" as const,
	updatedAt: null,
});

describe("OpenCode Go connection controller", () => {
	it("preserves existing model capabilities and user overrides when applying a model", async () => {
		const existing = {
			id: "deepseek-v4.1-flash",
			name: "Custom label",
			contextWindow: 90000,
			input: ["text"],
			reasoningEfforts: ["high"],
			compat: { supportsStore: false },
		};
		const other = { id: "other-model", input: ["text", "image"], compat: { supportsDeveloperRole: false } };
		const f = fixture({ models: [existing, other] });
		f.values.set("OPENCODE_GO_API_KEY", "fixture-secret");
		const controller = createOpenCodeGoConnectionController({
			credentials: f.credentials,
			settings: f.settings,
			callStatus,
		});
		await controller.applyConfiguration({
			credentialRef: "OPENCODE_GO_API_KEY",
			model: { id: existing.id, name: "Directory label", contextWindow: 100000 },
			expectedRevision: 4,
			confirmConflicts: false,
		});
		expect(f.mutate).toHaveBeenCalledWith(
			"llm-pi-ai",
			expect.arrayContaining([
				{ op: "set", path: ["providers", "coding-opencode-go", "models"], value: [existing, other] },
			]),
			4,
		);
	});
	it("saves a credential without returning its value and reads only the official model directory", async () => {
		const f = fixture();
		const fetchImpl = vi.fn(async () => Response.json({ data: [{ id: "deepseek-v4.1-flash" }] }));
		const controller = createOpenCodeGoConnectionController({
			credentials: f.credentials,
			settings: f.settings,
			callStatus,
			fetchImpl,
		});
		const saved = await controller.saveCredential({ credentialRef: "OPENCODE_GO_API_KEY", apiKey: "secret-test-key" });
		expect(JSON.stringify(saved)).not.toContain("secret-test-key");
		expect((await controller.models("OPENCODE_GO_API_KEY"))[0]?.id).toBe("deepseek-v4.1-flash");
		expect(fetchImpl).toHaveBeenCalledWith(
			`${OPENCODE_GO_BASE_URL}/models`,
			expect.objectContaining({ redirect: "error" }),
		);
	});

	it("applies only the Go provider fields with revision and removes a static session header after confirmation", async () => {
		const f = fixture({
			apiKeyEnv: "OPENCODE_GO_API_KEY",
			api: "responses",
			baseURL: "https://proxy.invalid/v1",
			headers: { "x-opencode-session": "static", "x-safe": "keep" },
			models: [],
		});
		f.values.set("OPENCODE_GO_API_KEY", "secret");
		const controller = createOpenCodeGoConnectionController({
			credentials: f.credentials,
			settings: f.settings,
			callStatus,
		});
		await expect(
			controller.applyConfiguration({
				credentialRef: "OPENCODE_GO_API_KEY",
				model: { id: "deepseek-v4.1-flash" },
				expectedRevision: 4,
				confirmConflicts: false,
			}),
		).rejects.toMatchObject({ code: "configuration-conflict" });
		await controller.applyConfiguration({
			credentialRef: "OPENCODE_GO_API_KEY",
			model: { id: "deepseek-v4.1-flash" },
			expectedRevision: 4,
			confirmConflicts: true,
		});
		expect(f.mutate).toHaveBeenCalledWith(
			"llm-pi-ai",
			expect.arrayContaining([
				{ op: "set", path: ["providers", "coding-opencode-go", "api"], value: OPENCODE_GO_API },
				{ op: "set", path: ["providers", "coding-opencode-go", "baseURL"], value: OPENCODE_GO_BASE_URL },
				{ op: "unset", path: ["providers", "coding-opencode-go", "headers", "x-opencode-session"] },
			]),
			4,
		);
	});

	it("requires an explicit account choice when distinct saved Go credentials exist", async () => {
		const f = fixture();
		f.values.set("OPENCODE_GO_API_KEY", "one");
		f.values.set("OPENCODE_API_KEY", "two");
		const controller = createOpenCodeGoConnectionController({
			credentials: f.credentials,
			settings: f.settings,
			callStatus,
		});
		expect((await controller.status()).credential.requiresChoice).toBe(true);
	});
});

it("requires the selected model protocol and preserves the rest of the route", async () => {
	const f = fixture({
		apiKeyEnv: "OPENCODE_GO_API_KEY",
		api: "openai-completions",
		baseURL: OPENCODE_GO_BASE_URL,
		models: [],
	});
	f.values.set("OPENCODE_GO_API_KEY", "fixture");
	const c = createOpenCodeGoConnectionController({ credentials: f.credentials, settings: f.settings, callStatus });
	await expect(
		c.applyConfiguration({
			credentialRef: "OPENCODE_GO_API_KEY",
			model: { id: "gpt-5.6-luna" },
			expectedRevision: 4,
			confirmConflicts: true,
		}),
	).rejects.toMatchObject({ code: "model-protocol-mismatch" });
	await expect(
		c.applyConfiguration({
			credentialRef: "OPENCODE_GO_API_KEY",
			model: { id: "gpt-5.6-luna" },
			api: "openai-responses",
			expectedRevision: 4,
			confirmConflicts: false,
		}),
	).rejects.toMatchObject({ code: "configuration-conflict" });
	await c.applyConfiguration({
		credentialRef: "OPENCODE_GO_API_KEY",
		model: { id: "gpt-5.6-luna" },
		api: "openai-responses",
		expectedRevision: 4,
		confirmConflicts: true,
	});
	expect(f.mutate).toHaveBeenCalledWith(
		"llm-pi-ai",
		expect.arrayContaining([
			{ op: "set", path: ["providers", "coding-opencode-go", "api"], value: "openai-responses" },
		]),
		4,
	);
});
it("does not break existing models when switching protocol", async () => {
	const f = fixture({ models: [{ id: "deepseek-v4.1-flash" }] });
	f.values.set("OPENCODE_GO_API_KEY", "fixture");
	const c = createOpenCodeGoConnectionController({ credentials: f.credentials, settings: f.settings, callStatus });
	await expect(
		c.applyConfiguration({
			credentialRef: "OPENCODE_GO_API_KEY",
			model: { id: "minimax-m3" },
			api: "anthropic-messages",
			expectedRevision: 4,
			confirmConflicts: true,
		}),
	).rejects.toMatchObject({ code: "model-protocol-mismatch" });
	expect(f.mutate).not.toHaveBeenCalled();
});

it("migrates plugin-shaped legacy opencode-go into coding-opencode-go without deleting the builtin", async () => {
	const values = new Map<string, string>([["OPENCODE_GO_API_KEY", "fixture"]]);
	const credentials = {
		describe: vi.fn(async (ref: string) => ({
			configured: values.has(String(ref)),
			writable: true,
			source: "store",
		})),
		resolve: vi.fn(async (ref: string) => (values.has(String(ref)) ? { value: values.get(String(ref))! } : undefined)),
		set: vi.fn(async () => undefined),
	} as unknown as CredentialProvider;
	const mutate = vi.fn(async () => undefined);
	const settings: OpenCodeGoSettingsProvider = {
		writable: true,
		describe: () => [
			{
				ns: "llm-pi-ai",
				revision: 7,
				value: {
					providers: {
						"opencode-go": {
							apiKeyEnv: "OPENCODE_GO_API_KEY",
							api: OPENCODE_GO_API,
							baseURL: OPENCODE_GO_BASE_URL,
							models: [{ id: "deepseek-v4.1-flash" }],
						},
					},
				},
			},
		],
		mutate,
	};
	const c = createOpenCodeGoConnectionController({ credentials, settings, callStatus });
	const status = await c.status();
	expect(status.providerId).toBe("coding-opencode-go");
	expect(status.legacy).toEqual({
		providerId: "opencode-go",
		present: true,
		migratable: true,
		targetProviderId: "coding-opencode-go",
	});
	expect(status.configuration.ready).toBe(false);
	await c.migrateLegacyConfiguration({ expectedRevision: 7 });
	expect(mutate).toHaveBeenCalledWith(
		"llm-pi-ai",
		expect.arrayContaining([
			{ op: "set", path: ["providers", "coding-opencode-go", "apiKeyEnv"], value: "OPENCODE_GO_API_KEY" },
			{ op: "set", path: ["providers", "coding-opencode-go", "api"], value: OPENCODE_GO_API },
			{ op: "set", path: ["providers", "coding-opencode-go", "baseURL"], value: OPENCODE_GO_BASE_URL },
		]),
		7,
	);
	const migrateCall = mutate.mock.calls[0] as unknown as [string, Array<{ op: string; path: string[] }>, number];
	const ops = migrateCall[1];
	expect(ops.every((op) => op.path[1] === "coding-opencode-go")).toBe(true);
	expect(ops.some((op) => op.path[1] === "opencode-go")).toBe(false);
});

it("apply writes only the isolated provider id", async () => {
	const f = fixture();
	f.values.set("OPENCODE_GO_API_KEY", "fixture");
	const c = createOpenCodeGoConnectionController({ credentials: f.credentials, settings: f.settings, callStatus });
	await c.applyConfiguration({
		credentialRef: "OPENCODE_GO_API_KEY",
		model: { id: "deepseek-v4.1-flash" },
		expectedRevision: 4,
		confirmConflicts: false,
	});
	const applyCall = f.mutate.mock.calls[0] as unknown as [string, Array<{ path: string[] }>, number];
	const ops = applyCall[1];
	expect(ops.every((op) => op.path[0] === "providers" && op.path[1] === "coding-opencode-go")).toBe(true);
});

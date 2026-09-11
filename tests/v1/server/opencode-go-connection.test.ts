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
		describe: () => [{ ns: "llm-pi-ai", revision, value: { providers: { "opencode-go": provider } } }],
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
				{ op: "set", path: ["providers", "opencode-go", "api"], value: OPENCODE_GO_API },
				{ op: "set", path: ["providers", "opencode-go", "baseURL"], value: OPENCODE_GO_BASE_URL },
				{ op: "set", path: ["providers", "opencode-go", "headers"], value: { "x-safe": "keep" } },
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

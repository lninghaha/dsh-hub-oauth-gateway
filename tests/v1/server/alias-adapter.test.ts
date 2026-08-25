import type {
	GenerateOptions,
	LlmModelInfo,
	LlmProviderInfo,
	LlmResolvedModelInfo,
	StreamChunk,
} from "@deepseek-ai/dsh-llm";
import { LlmAdapter } from "@deepseek-ai/dsh-llm";
import { describe, expect, it } from "vitest";
import { AliasLlmAdapter, normalizeReplayForRoute } from "../../../src/server/coding-oauth/alias-adapter.js";

class FakeAdapter extends LlmAdapter {
	seenProvider: string | undefined;
	seenOptions: GenerateOptions | undefined;

	constructor(private readonly chunks: readonly StreamChunk[] = []) {
		super();
	}

	providerInfo(provider: string): LlmProviderInfo {
		return { id: provider, name: `Native ${provider}` };
	}

	listModels(provider: string): Promise<readonly LlmModelInfo[]> {
		return Promise.resolve([{ provider, id: "m1", name: "Model 1", inputModalities: ["text"] }]);
	}

	resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
		return Promise.resolve({ provider, id: model, name: model, inputModalities: ["text"] });
	}

	async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
		this.seenProvider = options.provider;
		this.seenOptions = options;
		yield* this.chunks;
	}
}

describe("AliasLlmAdapter replay handling", () => {
	it("keeps the rc.2 replay envelope opaque while restoring the native provider", () => {
		const replayState = { response: { provider: "openai-codex", opaque: { value: 1 } } };
		const normalized = normalizeReplayForRoute(
			{ role: "assistant", source: { kind: "model", provider: "codex-oauth", model: "gpt", replayState } } as never,
			"codex-oauth",
			"openai-codex",
		) as never as { source: { provider: string; replayState: unknown } };

		expect(normalized.source.provider).toBe("openai-codex");
		expect(normalized.source.replayState).toBe(replayState);
	});

	it("removes foreign replay state and passes returned replay state through unchanged", async () => {
		const outputReplayState = { response: { provider: "openai-codex", opaque: { output: true } } };
		const finish = {
			type: "finish",
			reason: { kind: "stop" },
			replayState: outputReplayState,
		} as const satisfies StreamChunk;
		const inner = new FakeAdapter([finish]);
		const adapter = new AliasLlmAdapter(
			inner,
			new Map([
				["codex-oauth", "openai-codex"],
				["kimi-code-oauth", "kimi-coding"],
			]),
		);
		const ownReplayState = { response: { provider: "openai-codex", opaque: { input: true } } };
		const messages = [
			{
				id: "assistant-own",
				role: "assistant",
				content: [{ type: "text", text: "own" }],
				source: { kind: "model", provider: "codex-oauth", model: "m1", replayState: ownReplayState },
			},
			{
				id: "assistant-foreign",
				role: "assistant",
				content: [{ type: "text", text: "foreign" }],
				source: {
					kind: "model",
					provider: "kimi-code-oauth",
					model: "k3",
					replayState: { response: { provider: "kimi-coding", opaque: true } },
				},
			},
		] as unknown as GenerateOptions["messages"];
		const chunks: StreamChunk[] = [];

		for await (const chunk of adapter.stream({
			provider: "codex-oauth",
			model: "m1",
			messages,
		} as unknown as GenerateOptions)) {
			chunks.push(chunk);
		}

		expect(inner.seenProvider).toBe("openai-codex");
		const ownSource = inner.seenOptions?.messages[0]?.source;
		expect(ownSource).toMatchObject({ provider: "openai-codex" });
		if (ownSource?.kind !== "model") throw new Error("expected model replay source");
		expect(ownSource.replayState).toBe(ownReplayState);
		expect(inner.seenOptions?.messages[1]?.source).not.toHaveProperty("replayState");
		expect(chunks[0]).toBe(finish);
		const output = chunks[0];
		if (output?.type !== "finish") throw new Error("expected finish chunk");
		expect(output.replayState).toBe(outputReplayState);
	});

	it("uses the replay provider override for Codex Fast without changing its dispatch route", async () => {
		const inner = new FakeAdapter();
		const replayState = { response: { provider: "openai-codex", opaque: { value: 1 } } };
		const adapter = new AliasLlmAdapter(
			inner,
			new Map([["codex-oauth-fast", "codex-oauth-fast"]]),
			new Map(),
			new Map([["codex-oauth-fast", "openai-codex"]]),
		);

		for await (const _chunk of adapter.stream({
			provider: "codex-oauth-fast",
			model: "gpt",
			messages: [
				{
					id: "assistant-fast",
					role: "assistant",
					content: [{ type: "text", text: "done" }],
					source: { kind: "model", provider: "codex-oauth-fast", model: "gpt", replayState },
				},
			],
		} as never)) {
		}

		expect(inner.seenProvider).toBe("codex-oauth-fast");
		const source = inner.seenOptions?.messages[0]?.source;
		expect(source).toMatchObject({ provider: "openai-codex" });
		if (source?.kind !== "model") throw new Error("expected model replay source");
		expect(source.replayState).toBe(replayState);
	});

	it.each(["PI_AI_ERROR", "AUTH"])(
		"remaps xAI capacity failures from %s to RATE_LIMIT without invalidating auth",
		async (code) => {
			const message = "The model is currently at capacity due to high demand.";
			const inner = new FakeAdapter([
				{
					type: "finish",
					reason: { kind: "error", failure: { message, code } },
				},
			]);
			let invalidations = 0;
			const adapter = new AliasLlmAdapter(
				inner,
				new Map([["grok-build", "xai"]]),
				new Map([
					[
						"grok-build",
						{
							onAuthFailure: async () => {
								invalidations += 1;
							},
						},
					],
				]),
			);
			const chunks: StreamChunk[] = [];

			for await (const chunk of adapter.stream({
				provider: "grok-build",
				model: "grok-4.6",
				messages: [],
			} as unknown as GenerateOptions)) {
				chunks.push(chunk);
			}

			expect(invalidations).toBe(0);
			expect(chunks).toMatchObject([
				{
					type: "finish",
					reason: { kind: "error", failure: { message, code: "RATE_LIMIT" } },
				},
			]);
		},
	);
});

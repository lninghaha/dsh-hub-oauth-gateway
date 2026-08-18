import { describe, expect, it } from "vitest";
import { CapabilityRuntimeState } from "../../../../src/server/coding-oauth/capability-runtime.js";
import {
	CAPABILITY_FLAG_KEYS,
	capabilityFlags,
	DEFAULT_CAPABILITY_SETTINGS,
	resolveCapabilitySettings,
} from "../../../../src/server/coding-oauth/capability-settings.js";
import { RuntimeConfigSchema } from "../../../../src/server/config.js";

describe("coding OAuth capability defaults", () => {
	it("keeps every optional flag off when YAML omits capabilities", () => {
		const parsed = RuntimeConfigSchema.parse({});
		expect(parsed.codingOAuth.capabilities).toBeUndefined();
		const resolved = resolveCapabilitySettings(parsed.codingOAuth.capabilities);
		expect(capabilityFlags(resolved)).toEqual({
			codexSearch: false,
			codexImages: false,
			codexImageEdits: false,
			codexUsage: false,
			codexFast: false,
			grokImagineImage: false,
			grokImagineVideo: false,
		});
		for (const key of CAPABILITY_FLAG_KEYS) {
			expect(resolved[key]).toBe(false);
			expect(DEFAULT_CAPABILITY_SETTINGS[key]).toBe(false);
		}
	});

	it("starts the runtime projection with every flag off", () => {
		const runtime = new CapabilityRuntimeState();
		expect(capabilityFlags(runtime.current())).toEqual(capabilityFlags(DEFAULT_CAPABILITY_SETTINGS));
	});
});

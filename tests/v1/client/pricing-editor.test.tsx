/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PricingEditor } from "../../../src/client/components/PricingEditor.js";
import { en, translator } from "../../../src/client/locales.js";

let saveSuccess: (() => void) | undefined;
let saveIsSuccess = false;
const save = vi.fn((_input: unknown, options?: { readonly onSuccess?: () => void }) => {
	saveSuccess = options?.onSuccess;
});

vi.mock("../../../src/client/queries.js", () => ({
	usePricingQuery: () => ({
		data: {
			ok: true as const,
			data: {
				baseCurrency: "USD",
				rules: [
					{
						id: "existing",
						providerPattern: "existing*",
						modelPattern: "model*",
						inputPerMillion: 1,
						outputPerMillion: 2,
						cacheReadPerMillion: null,
						cacheWritePerMillion: null,
						currency: "USD",
						effectiveFrom: 0,
						source: "user" as const,
						updatedAt: 1,
					},
				],
			},
		},
	}),
	useSavePricingMutation: () => ({ mutate: save, isPending: false, isSuccess: saveIsSuccess, error: null }),
}));

const t = translator(((key: string) => (en as Record<string, string>)[key] ?? key) as never);

describe("PricingEditor replacement safety", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		saveSuccess = undefined;
		saveIsSuccess = false;
	});

	it("previews a preset, warns about dirty drafts, and supports undo", () => {
		render(<PricingEditor t={t} />);
		const provider = screen.getByDisplayValue("existing*");
		fireEvent.change(provider, { target: { value: "draft*" } });
		fireEvent.click(screen.getByRole("button", { name: en["pricing.preset.openai"] }));

		expect(screen.getByDisplayValue("draft*")).toBeTruthy();
		expect(screen.getByText(en["pricing.previewDirty"])).toBeTruthy();
		expect(screen.getByText("2 added, 0 changed, 1 removed.")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: en["pricing.previewApply"] }));
		expect(screen.queryByDisplayValue("draft*")).toBeNull();
		expect(screen.getAllByDisplayValue("openai*")).toHaveLength(2);

		fireEvent.click(screen.getByRole("button", { name: en["pricing.undo"] }));
		expect(screen.getByDisplayValue("draft*")).toBeTruthy();
		expect(screen.queryByDisplayValue("openai*")).toBeNull();
		expect(save).not.toHaveBeenCalled();
	});

	it("counts duplicate rule identities without collapsing the preview", () => {
		render(<PricingEditor t={t} />);
		fireEvent.click(screen.getByRole("button", { name: en["pricing.add"] }));
		fireEvent.click(screen.getByRole("button", { name: en["pricing.add"] }));
		fireEvent.click(screen.getByRole("button", { name: en["pricing.preset.openai"] }));
		expect(screen.getByText("2 added, 0 changed, 3 removed.")).toBeTruthy();
	});

	it("keeps later edits dirty when an earlier save succeeds", () => {
		const rendered = render(<PricingEditor t={t} />);
		const provider = screen.getByDisplayValue("existing*");
		fireEvent.change(provider, { target: { value: "saved*" } });
		fireEvent.click(screen.getByRole("button", { name: en["settings.save"] }));
		expect(saveSuccess).toBeTypeOf("function");

		fireEvent.change(screen.getByDisplayValue("saved*"), { target: { value: "new-draft*" } });
		act(() => saveSuccess?.());
		saveIsSuccess = true;
		rendered.rerender(<PricingEditor t={t} />);

		expect(screen.getByDisplayValue("new-draft*")).toBeTruthy();
		expect(screen.queryByText(en["settings.saved"])).toBeNull();
		expect(screen.getByRole("button", { name: en["settings.save"] }).hasAttribute("disabled")).toBe(false);
	});

	it("treats an undo during a pending save as a new draft after the save succeeds", () => {
		const rendered = render(<PricingEditor t={t} />);
		fireEvent.click(screen.getByRole("button", { name: en["pricing.preset.openai"] }));
		fireEvent.click(screen.getByRole("button", { name: en["pricing.previewApply"] }));
		fireEvent.click(screen.getByRole("button", { name: en["settings.save"] }));
		expect(saveSuccess).toBeTypeOf("function");

		fireEvent.click(screen.getByRole("button", { name: en["pricing.undo"] }));
		expect(screen.getByDisplayValue("existing*")).toBeTruthy();
		act(() => saveSuccess?.());
		saveIsSuccess = true;
		rendered.rerender(<PricingEditor t={t} />);

		expect(screen.getByDisplayValue("existing*")).toBeTruthy();
		expect(screen.queryByText(en["settings.saved"])).toBeNull();
		expect(screen.getByRole("button", { name: en["settings.save"] }).hasAttribute("disabled")).toBe(false);
	});
});

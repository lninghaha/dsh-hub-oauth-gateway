/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeesEditor } from "../../../src/client/components/FeesEditor.js";
import { en, translator } from "../../../src/client/locales.js";

let saveSuccess: (() => void) | undefined;
let saveIsSuccess = false;
const save = vi.fn((_input: unknown, options?: { readonly onSuccess?: () => void }) => {
	saveSuccess = options?.onSuccess;
});

vi.mock("../../../src/client/queries.js", () => ({
	useFeesQuery: () => ({
		data: {
			ok: true as const,
			data: {
				fees: [
					{
						id: "fee-1",
						providerId: " provider ",
						profileId: "",
						accountLabel: null,
						kind: "subscription" as const,
						planName: " Team ",
						amount: 4,
						currency: " usd ",
						interval: "month" as const,
						anchorDate: null,
						nextRenewalDate: "2026-08-22",
						topups: [],
						notes: " Note ",
						updatedAt: 1,
					},
				],
			},
		},
	}),
	useSaveFeesMutation: () => ({ mutate: save, isPending: false, isSuccess: saveIsSuccess, error: null }),
}));

const t = translator(((key: string) => (en as Record<string, string>)[key] ?? key) as never);

describe("FeesEditor", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		saveSuccess = undefined;
		saveIsSuccess = false;
	});

	it("keeps the text draft until save, then reports field errors without mutating it", () => {
		render(<FeesEditor t={t} currency="USD" />);
		const amount = screen.getByDisplayValue("4");
		fireEvent.change(amount, { target: { value: "not-a-number" } });
		fireEvent.click(screen.getByRole("button", { name: en["settings.save"] }));
		expect(screen.getByText(en["fees.errorAmount"])).toBeTruthy();
		expect(screen.getByDisplayValue("not-a-number")).toBeTruthy();
		expect(save).not.toHaveBeenCalled();
	});

	it("normalizes text and numeric fields only when saving", () => {
		render(<FeesEditor t={t} currency="USD" />);
		fireEvent.change(screen.getByDisplayValue("4"), { target: { value: "12.50" } });
		fireEvent.click(screen.getByRole("button", { name: en["settings.save"] }));
		expect(save).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					providerId: "provider",
					amount: 12.5,
					currency: "USD",
					planName: "Team",
					notes: "Note",
				}),
			],
			expect.any(Object),
		);
	});

	it("clears saved state on later edits and ignores a stale save response", () => {
		const rendered = render(<FeesEditor t={t} currency="USD" />);
		const amount = screen.getByDisplayValue("4");
		fireEvent.change(amount, { target: { value: "5" } });
		fireEvent.click(screen.getByRole("button", { name: en["settings.save"] }));
		act(() => saveSuccess?.());
		saveIsSuccess = true;
		rendered.rerender(<FeesEditor t={t} currency="USD" />);
		expect(screen.getByText(en["settings.feesSaved"])).toBeTruthy();

		fireEvent.change(screen.getByDisplayValue("5"), { target: { value: "6" } });
		expect(screen.queryByText(en["settings.feesSaved"])).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: en["settings.save"] }));
		fireEvent.change(screen.getByDisplayValue("6"), { target: { value: "7" } });
		act(() => saveSuccess?.());
		rendered.rerender(<FeesEditor t={t} currency="USD" />);

		expect(screen.getByDisplayValue("7")).toBeTruthy();
		expect(screen.queryByText(en["settings.feesSaved"])).toBeNull();
	});
});

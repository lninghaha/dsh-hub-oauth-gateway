/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeesEditor } from "../../../src/client/components/FeesEditor.js";
import { en, translator } from "../../../src/client/locales.js";

const save = vi.fn();
const refetch = vi.fn();
let queryError: Error | null = null;

vi.mock("../../../src/client/queries.js", () => ({
	useFeesQuery: () => ({ data: undefined, isPending: queryError === null, error: queryError, refetch }),
	useSaveFeesMutation: () => ({ mutate: save, isPending: false, isSuccess: false, error: null }),
}));

const t = translator(((key: string) => (en as Record<string, string>)[key] ?? key) as never);

describe("FeesEditor load safety", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		queryError = null;
	});

	it("does not expose destructive editing actions before the ledger loads", () => {
		render(<FeesEditor t={t} currency="USD" />);
		expect(screen.getByText(en["fees.loading"])).toBeTruthy();
		expect(screen.queryByRole("button", { name: en["settings.save"] })).toBeNull();
		expect(screen.queryByRole("button", { name: en["fees.add"] })).toBeNull();
		expect(save).not.toHaveBeenCalled();
	});

	it("shows a retryable error without replacing the ledger with an empty draft", () => {
		queryError = new Error("offline");
		render(<FeesEditor t={t} currency="USD" />);
		expect(screen.getByText("Could not load fee records: offline")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: en["action.retry"] }));
		expect(refetch).toHaveBeenCalledOnce();
		expect(save).not.toHaveBeenCalled();
	});
});

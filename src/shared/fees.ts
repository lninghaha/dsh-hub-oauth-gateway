import { z } from "zod";
import { CurrencyCodeSchema } from "./domain.js";

export const FeeKindSchema = z.enum(["subscription", "topup"]);
export type FeeKind = z.infer<typeof FeeKindSchema>;

export const FeeIntervalSchema = z.enum(["month", "year"]);
export type FeeInterval = z.infer<typeof FeeIntervalSchema>;

const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const FeeTopupSchema = z
	.object({
		date: DateStringSchema,
		amount: z.number().nonnegative(),
	})
	.strict();

export type FeeTopup = z.infer<typeof FeeTopupSchema>;

export const AccountFeeRecordSchema = z
	.object({
		id: z.string().min(1).max(128),
		providerId: z.string().min(1).max(128),
		profileId: z.string().max(128).default(""),
		accountLabel: z.string().trim().max(128).nullable(),
		kind: FeeKindSchema,
		planName: z.string().trim().max(128).nullable(),
		amount: z.number().nonnegative(),
		currency: CurrencyCodeSchema,
		interval: FeeIntervalSchema.nullable(),
		anchorDate: DateStringSchema.nullable(),
		nextRenewalDate: DateStringSchema.nullable(),
		topups: z.array(FeeTopupSchema).max(256),
		notes: z.string().trim().max(512).nullable(),
		updatedAt: z.number().int().nonnegative(),
	})
	.strict()
	.superRefine((value, context) => {
		if (value.kind === "subscription" && value.interval === null) {
			context.addIssue({ code: "custom", path: ["interval"], message: "subscription requires interval" });
		}
		if (value.kind === "topup" && value.topups.length === 0 && value.amount === 0) {
			context.addIssue({ code: "custom", path: ["topups"], message: "topup requires amount or topups" });
		}
	});

export type AccountFeeRecord = z.infer<typeof AccountFeeRecordSchema>;

export const FeesDataSchema = z.object({ fees: z.array(AccountFeeRecordSchema).max(256) }).strict();
export type FeesData = z.infer<typeof FeesDataSchema>;

export function monthlyEquivalent(fee: AccountFeeRecord, today = new Date()): number | null {
	if (fee.kind === "subscription") {
		if (fee.interval === "month") return fee.amount;
		if (fee.interval === "year") return fee.amount / 12;
		return null;
	}
	const year = today.getFullYear();
	const month = today.getMonth() + 1;
	const prefix = `${year}-${String(month).padStart(2, "0")}-`;
	const fromTopups = fee.topups
		.filter((entry) => entry.date.startsWith(prefix))
		.reduce((sum, entry) => sum + entry.amount, 0);
	if (fee.topups.length > 0) return fromTopups;
	return fee.amount;
}

export function paybackMultiplier(
	fee: AccountFeeRecord,
	monthEstimatedCost: number | null,
	baseCurrency: string,
): number | null {
	if (monthEstimatedCost === null) return null;
	if (fee.currency !== baseCurrency.toUpperCase()) return null;
	const monthly = monthlyEquivalent(fee);
	if (monthly === null || monthly <= 0) return null;
	return Math.round((monthEstimatedCost / monthly) * 100) / 100;
}

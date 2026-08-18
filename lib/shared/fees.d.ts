import { z } from "zod";
export declare const FeeKindSchema: z.ZodEnum<{
    subscription: "subscription";
    topup: "topup";
}>;
export type FeeKind = z.infer<typeof FeeKindSchema>;
export declare const FeeIntervalSchema: z.ZodEnum<{
    month: "month";
    year: "year";
}>;
export type FeeInterval = z.infer<typeof FeeIntervalSchema>;
export declare const FeeTopupSchema: z.ZodObject<{
    date: z.ZodString;
    amount: z.ZodNumber;
}, z.core.$strict>;
export type FeeTopup = z.infer<typeof FeeTopupSchema>;
export declare const AccountFeeRecordSchema: z.ZodObject<{
    id: z.ZodString;
    providerId: z.ZodString;
    accountLabel: z.ZodNullable<z.ZodString>;
    kind: z.ZodEnum<{
        subscription: "subscription";
        topup: "topup";
    }>;
    planName: z.ZodNullable<z.ZodString>;
    amount: z.ZodNumber;
    currency: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    interval: z.ZodNullable<z.ZodEnum<{
        month: "month";
        year: "year";
    }>>;
    anchorDate: z.ZodNullable<z.ZodString>;
    nextRenewalDate: z.ZodNullable<z.ZodString>;
    topups: z.ZodArray<z.ZodObject<{
        date: z.ZodString;
        amount: z.ZodNumber;
    }, z.core.$strict>>;
    notes: z.ZodNullable<z.ZodString>;
    updatedAt: z.ZodNumber;
}, z.core.$strict>;
export type AccountFeeRecord = z.infer<typeof AccountFeeRecordSchema>;
export declare const FeesDataSchema: z.ZodObject<{
    fees: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        providerId: z.ZodString;
        accountLabel: z.ZodNullable<z.ZodString>;
        kind: z.ZodEnum<{
            subscription: "subscription";
            topup: "topup";
        }>;
        planName: z.ZodNullable<z.ZodString>;
        amount: z.ZodNumber;
        currency: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
        interval: z.ZodNullable<z.ZodEnum<{
            month: "month";
            year: "year";
        }>>;
        anchorDate: z.ZodNullable<z.ZodString>;
        nextRenewalDate: z.ZodNullable<z.ZodString>;
        topups: z.ZodArray<z.ZodObject<{
            date: z.ZodString;
            amount: z.ZodNumber;
        }, z.core.$strict>>;
        notes: z.ZodNullable<z.ZodString>;
        updatedAt: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type FeesData = z.infer<typeof FeesDataSchema>;
export declare function monthlyEquivalent(fee: AccountFeeRecord, today?: Date): number | null;
export declare function paybackMultiplier(fee: AccountFeeRecord, monthEstimatedCost: number | null, baseCurrency: string): number | null;
//# sourceMappingURL=fees.d.ts.map
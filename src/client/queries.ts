import { QueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
	AccountsDataSchema,
	ActivityDataSchema,
	AlertsDataSchema,
	API_PATHS,
	BreakdownDataSchema,
	DshCompatibilitySchema,
	type ExportLayout,
	FeesDataSchema,
	OverviewDataSchema,
	PricingDataSchema,
	SeriesDataSchema,
} from "../shared/contracts.js";
import type { PriceRule } from "../shared/domain.js";
import type { FeesData } from "../shared/fees.js";
import {
	LocalAuthResponseSchema,
	LocalUsageResponseSchema,
	LocalUsageScanResultSchema,
} from "../shared/local-monitor.js";
import { type UserPreferences, UserPreferencesSchema } from "../shared/preferences.js";
import { ProvidersDataSchema } from "../shared/providers.js";
import { StatusProbesResponseSchema } from "../shared/status-probes.js";
import { fetchApi, mutateApi } from "./api.js";
import { queryString, type ResolvedUsageQuery } from "./range.js";

export const usageQueryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			gcTime: 10 * 60_000,
			retry: 1,
			refetchOnWindowFocus: false,
		},
	},
});

const RefreshResultSchema = z.record(z.string(), z.unknown());
const CredentialDescriptionSchema = z
	.object({
		ref: z.string(),
		configured: z.boolean(),
		source: z.string().nullable(),
		writable: z.boolean(),
	})
	.strict();
const CredentialUnsetSchema = z.object({ ref: z.string(), configured: z.literal(false) }).strict();
const CredentialImportSchema = z.object({ ref: z.string() }).strict();
const DeviceCodeSchema = z
	.object({
		providerId: z.string(),
		flowId: z.string(),
		userCode: z.string(),
		verificationUri: z.string(),
		expiresIn: z.number().positive(),
		interval: z.number().positive(),
	})
	.strict();
const DevicePollSchema = z
	.object({
		pending: z.boolean(),
		ref: z.string().optional(),
	})
	.strict();

function endpoint(path: string, query: ResolvedUsageQuery): string {
	return `${path}?${queryString(query)}`;
}

function visibleRefetchInterval(ms: number, enabled: boolean): false | number | (() => number | false) {
	if (!enabled) return false;
	return () => {
		if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
		return ms;
	};
}

export function useOverviewQuery(query: ResolvedUsageQuery, enabled = true) {
	const url = endpoint(API_PATHS.overview, query);
	return useQuery(
		{
			queryKey: ["usage-stats", "overview", url],
			queryFn: ({ signal }) => fetchApi(url, OverviewDataSchema, {}, signal),
			enabled,
			refetchInterval: visibleRefetchInterval(30_000, enabled),
		},
		usageQueryClient,
	);
}

export function useSeriesQuery(query: ResolvedUsageQuery, enabled = true) {
	const url = endpoint(API_PATHS.series, query);
	return useQuery(
		{
			queryKey: ["usage-stats", "series", url],
			queryFn: ({ signal }) => fetchApi(url, SeriesDataSchema, {}, signal),
			enabled,
			refetchInterval: visibleRefetchInterval(30_000, enabled),
		},
		usageQueryClient,
	);
}

export function useBreakdownQuery(
	query: ResolvedUsageQuery,
	dimension: "provider" | "model" | "session",
	enabled = true,
) {
	const url = `${endpoint(API_PATHS.breakdown, query)}&dimension=${dimension}`;
	return useQuery(
		{
			queryKey: ["usage-stats", "breakdown", url],
			queryFn: ({ signal }) => fetchApi(url, BreakdownDataSchema, {}, signal),
			enabled,
			refetchInterval: visibleRefetchInterval(30_000, enabled),
		},
		usageQueryClient,
	);
}

export function useProvidersQuery(enabled = true) {
	return useQuery(
		{
			queryKey: ["usage-stats", "providers"],
			queryFn: ({ signal }) => fetchApi(API_PATHS.providers, ProvidersDataSchema, {}, signal),
			enabled,
			refetchInterval: visibleRefetchInterval(30_000, enabled),
		},
		usageQueryClient,
	);
}

export function useAccountsQuery(enabled = true) {
	return useQuery(
		{
			queryKey: ["usage-stats", "accounts"],
			queryFn: ({ signal }) => fetchApi(API_PATHS.accounts, AccountsDataSchema, {}, signal),
			enabled,
			refetchInterval: visibleRefetchInterval(5 * 60_000, enabled),
		},
		usageQueryClient,
	);
}

export function useAlertsQuery(enabled = true) {
	return useQuery(
		{
			queryKey: ["usage-stats", "alerts"],
			queryFn: ({ signal }) => fetchApi(API_PATHS.alerts, AlertsDataSchema, {}, signal),
			enabled,
			refetchInterval: visibleRefetchInterval(60_000, enabled),
		},
		usageQueryClient,
	);
}

export function useActivityQuery(
	metric: "tokens" | "estimatedCost" | "requests" | "cacheHitRate",
	enabled = true,
	providers: readonly string[] = [],
) {
	const params = new URLSearchParams({ metric });
	if (providers.length > 0) params.set("providers", providers.join(","));
	const url = `${API_PATHS.activity}?${params.toString()}`;
	return useQuery(
		{
			queryKey: ["usage-stats", "activity", url],
			queryFn: ({ signal }) => fetchApi(url, ActivityDataSchema, {}, signal),
			enabled,
			refetchInterval: visibleRefetchInterval(60_000, enabled),
		},
		usageQueryClient,
	);
}

export function useFeesQuery(enabled = true) {
	return useQuery(
		{
			queryKey: ["usage-stats", "fees"],
			queryFn: ({ signal }) => fetchApi(API_PATHS.fees, FeesDataSchema, {}, signal),
			enabled,
			refetchInterval: visibleRefetchInterval(60_000, enabled),
		},
		usageQueryClient,
	);
}

export function useSaveFeesMutation() {
	return useMutation(
		{
			mutationFn: (fees: FeesData["fees"]) => mutateApi(API_PATHS.fees, "PUT", { fees }, FeesDataSchema),
			onSuccess: async () => {
				await usageQueryClient.invalidateQueries({ queryKey: ["usage-stats", "fees"] });
			},
		},
		usageQueryClient,
	);
}

export function usePreferencesQuery(enabled = true) {
	return useQuery(
		{
			queryKey: ["usage-stats", "settings"],
			queryFn: ({ signal }) => fetchApi(API_PATHS.settings, UserPreferencesSchema, {}, signal),
			enabled,
		},
		usageQueryClient,
	);
}

export function useCompatibilityQuery(enabled = true) {
	return useQuery(
		{
			queryKey: ["usage-stats", "compatibility"],
			queryFn: ({ signal }) => fetchApi(API_PATHS.compatibility, DshCompatibilitySchema, {}, signal),
			enabled,
			refetchOnWindowFocus: true,
		},
		usageQueryClient,
	);
}

export function usePricingQuery(enabled = true) {
	return useQuery(
		{
			queryKey: ["usage-stats", "pricing"],
			queryFn: ({ signal }) => fetchApi(API_PATHS.pricing, PricingDataSchema, {}, signal),
			enabled,
		},
		usageQueryClient,
	);
}

export function useSavePricingMutation() {
	return useMutation(
		{
			mutationFn: ({ baseCurrency, rules }: { baseCurrency: string; rules: readonly PriceRule[] }) =>
				mutateApi(API_PATHS.pricing, "PUT", { baseCurrency, rules }, PricingDataSchema),
			onSuccess: async () => {
				await usageQueryClient.invalidateQueries({ queryKey: ["usage-stats", "pricing"] });
				await usageQueryClient.invalidateQueries({ queryKey: ["usage-stats", "overview"] });
			},
		},
		usageQueryClient,
	);
}

export interface RefreshRequest {
	readonly scope: "usage" | "accounts" | "all";
	/** Optional account provider ids for a targeted accounts refresh. */
	readonly providerIds?: readonly string[];
}

export function useRefreshMutation() {
	return useMutation(
		{
			mutationFn: ({ scope, providerIds }: RefreshRequest) =>
				mutateApi(
					API_PATHS.refresh,
					"POST",
					{ scope, ...(providerIds === undefined ? {} : { providerIds }) },
					RefreshResultSchema,
				),
			onSuccess: async () => {
				await usageQueryClient.invalidateQueries({ queryKey: ["usage-stats"] });
			},
		},
		usageQueryClient,
	);
}

export function useSavePreferencesMutation() {
	return useMutation(
		{
			mutationFn: (preferences: UserPreferences) =>
				mutateApi(API_PATHS.settings, "PUT", preferences, UserPreferencesSchema),
			onSuccess: async () => {
				await usageQueryClient.invalidateQueries({ queryKey: ["usage-stats", "settings"] });
				await usageQueryClient.invalidateQueries({ queryKey: ["usage-stats", "overview"] });
			},
		},
		usageQueryClient,
	);
}

export function useCredentialQuery(ref: string, enabled = true) {
	return useQuery(
		{
			queryKey: ["usage-stats", "credential", ref],
			queryFn: ({ signal }) =>
				fetchApi(`${API_PATHS.credentials}?ref=${encodeURIComponent(ref)}`, CredentialDescriptionSchema, {}, signal),
			enabled: enabled && ref !== "",
		},
		usageQueryClient,
	);
}

export function useSetCredentialMutation() {
	return useMutation(
		{
			mutationFn: ({ ref, value }: { ref: string; value: string }) =>
				mutateApi(API_PATHS.credentials, "PUT", { ref, value }, CredentialDescriptionSchema),
			onSuccess: async (_response, variables) => {
				await usageQueryClient.invalidateQueries({ queryKey: ["usage-stats", "credential", variables.ref] });
				await usageQueryClient.invalidateQueries({ queryKey: ["usage-stats", "accounts"] });
				await usageQueryClient.invalidateQueries({ queryKey: ["usage-stats", "providers"] });
			},
		},
		usageQueryClient,
	);
}

export function useUnsetCredentialMutation() {
	return useMutation(
		{
			mutationFn: (ref: string) =>
				mutateApi(`${API_PATHS.credentials}?ref=${encodeURIComponent(ref)}`, "DELETE", {}, CredentialUnsetSchema),
			onSuccess: async (_response, ref) => {
				await usageQueryClient.invalidateQueries({ queryKey: ["usage-stats", "credential", ref] });
				await usageQueryClient.invalidateQueries({ queryKey: ["usage-stats", "accounts"] });
				await usageQueryClient.invalidateQueries({ queryKey: ["usage-stats", "providers"] });
			},
		},
		usageQueryClient,
	);
}

export function useCredentialImportMutation() {
	return useMutation(
		{
			mutationFn: (providerId: string) =>
				mutateApi(API_PATHS.credentialImport, "POST", { providerId }, CredentialImportSchema),
			onSuccess: async () => usageQueryClient.invalidateQueries({ queryKey: ["usage-stats"] }),
		},
		usageQueryClient,
	);
}

export function useDeviceCodeMutation() {
	return useMutation(
		{
			mutationFn: (providerId: string) => mutateApi(API_PATHS.oauthDevice, "POST", { providerId }, DeviceCodeSchema),
		},
		usageQueryClient,
	);
}

export function useDevicePollMutation() {
	return useMutation(
		{
			mutationFn: ({ providerId, flowId }: { providerId: string; flowId: string }) =>
				mutateApi(API_PATHS.oauthDevicePoll, "POST", { providerId, flowId }, DevicePollSchema),
			onSuccess: async (response) => {
				if (response.ok && !response.data.pending)
					await usageQueryClient.invalidateQueries({ queryKey: ["usage-stats"] });
			},
		},
		usageQueryClient,
	);
}

export function exportUrl(
	query: ResolvedUsageQuery,
	format: "csv" | "json",
	dimension: "provider" | "model" | "session",
	layout: ExportLayout = "filtered",
): string {
	return `${endpoint(API_PATHS.export, query)}&format=${format}&dimension=${dimension}&layout=${layout}`;
}

export function useLocalAuthQuery(enabled = true) {
	return useQuery(
		{
			queryKey: ["usage-stats", "local-auth"],
			queryFn: ({ signal }) => fetchApi(API_PATHS.localAuth, LocalAuthResponseSchema, {}, signal),
			enabled,
			refetchInterval: visibleRefetchInterval(60_000, enabled),
		},
		usageQueryClient,
	);
}

export function useLocalUsageQuery(enabled = true, from?: string, to?: string) {
	const params = new URLSearchParams();
	if (from !== undefined) params.set("from", from);
	if (to !== undefined) params.set("to", to);
	const suffix = params.size === 0 ? "" : `?${params.toString()}`;
	return useQuery(
		{
			queryKey: ["usage-stats", "local-usage", suffix],
			queryFn: ({ signal }) => fetchApi(`${API_PATHS.localUsage}${suffix}`, LocalUsageResponseSchema, {}, signal),
			enabled,
			refetchInterval: visibleRefetchInterval(60_000, enabled),
		},
		usageQueryClient,
	);
}

export function useLocalUsageScanMutation() {
	return useMutation(
		{
			mutationFn: () => mutateApi(API_PATHS.localUsageScan, "POST", {}, LocalUsageScanResultSchema),
			onSuccess: async () => {
				await usageQueryClient.invalidateQueries({ queryKey: ["usage-stats", "local-usage"] });
			},
		},
		usageQueryClient,
	);
}

export function useStatusProbesQuery(enabled = true) {
	return useQuery(
		{
			queryKey: ["usage-stats", "status-probes"],
			queryFn: ({ signal }) => fetchApi(API_PATHS.statusProbes, StatusProbesResponseSchema, {}, signal),
			enabled,
			refetchInterval: visibleRefetchInterval(120_000, enabled),
		},
		usageQueryClient,
	);
}

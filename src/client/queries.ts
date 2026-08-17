import { QueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
	AccountsDataSchema,
	AlertsDataSchema,
	API_PATHS,
	BreakdownDataSchema,
	OverviewDataSchema,
	PricingDataSchema,
	SeriesDataSchema,
} from "../shared/contracts.js";
import type { PriceRule } from "../shared/domain.js";
import { type UserPreferences, UserPreferencesSchema } from "../shared/preferences.js";
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

export function useOverviewQuery(query: ResolvedUsageQuery, enabled = true) {
	const url = endpoint(API_PATHS.overview, query);
	return useQuery(
		{
			queryKey: ["usage-stats", "overview", url],
			queryFn: ({ signal }) => fetchApi(url, OverviewDataSchema, {}, signal),
			enabled,
			refetchInterval: enabled ? 30_000 : false,
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
			refetchInterval: enabled ? 30_000 : false,
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
			refetchInterval: enabled ? 30_000 : false,
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
			refetchInterval: enabled ? 5 * 60_000 : false,
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
			refetchInterval: enabled ? 60_000 : false,
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

export function useRefreshMutation() {
	return useMutation(
		{
			mutationFn: (scope: "usage" | "accounts" | "all") =>
				mutateApi(API_PATHS.refresh, "POST", { scope }, RefreshResultSchema),
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
): string {
	return `${endpoint(API_PATHS.export, query)}&format=${format}&dimension=${dimension}`;
}

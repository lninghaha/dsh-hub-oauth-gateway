/**
 * Fetch layer + react-query hooks for the integrated coding-subscription
 * OAuth routes. Unlike the usage-stats API these endpoints answer with bare
 * JSON documents and `{error, code?}` failures; both sides are validated
 * here with the shared zod contracts.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { type ZodType, z } from "zod";
import {
	type CapabilitySettingsPatch,
	type CapabilitySettingsSnapshot,
	CapabilitySettingsSnapshotSchema,
	CODING_OAUTH_PATHS,
	type CodingOAuthProviderSlug,
	type CodingOAuthWebStatus,
	CodingOAuthWebStatusSchema,
	GatewayKeyRevealSchema,
	type GatewayPublicStatus,
	GatewayPublicStatusSchema,
	ImagineCredentialStatusSchema,
	LoginChallengeSchema,
	OAuthImportCancelResultSchema,
	type OAuthImportCommitResult,
	OAuthImportCommitResultSchema,
	type OAuthImportPreview,
	OAuthImportPreviewSchema,
	OAuthImportSourcesResponseSchema,
	type OAuthSourceKind,
} from "../shared/coding-oauth.js";
import { usageQueryClient } from "./queries.js";

export class CodingOAuthApiError extends Error {
	readonly status: number;
	readonly code: string | undefined;

	constructor(message: string, status: number, code?: string) {
		super(message);
		this.name = "CodingOAuthApiError";
		this.status = status;
		this.code = code;
	}
}

function errorFrom(payload: unknown, status: number): CodingOAuthApiError {
	if (payload !== null && typeof payload === "object") {
		const record = payload as { error?: unknown; code?: unknown };
		const message = typeof record.error === "string" && record.error !== "" ? record.error : `HTTP ${status}`;
		const code = typeof record.code === "string" ? record.code : undefined;
		return new CodingOAuthApiError(message, status, code);
	}
	return new CodingOAuthApiError(`HTTP ${status}`, status);
}

async function callCodingOAuth<T>(path: string, schema: ZodType<T>, init: RequestInit = {}): Promise<T> {
	const headers = new Headers(init.headers);
	if (init.method !== undefined && init.method !== "GET") headers.set("content-type", "application/json");
	const response = await fetch(path, { ...init, headers });
	let payload: unknown = null;
	try {
		payload = await response.json();
	} catch {
		payload = null;
	}
	if (!response.ok) throw errorFrom(payload, response.status);
	return schema.parse(payload);
}

function postCodingOAuth<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
	return callCodingOAuth(path, schema, { method: "POST", body: JSON.stringify(body) });
}

const CODING_OAUTH_KEY = "coding-oauth";

export async function invalidateCodingOAuthQueries(): Promise<void> {
	await usageQueryClient.invalidateQueries({ queryKey: [CODING_OAUTH_KEY] });
}

export function useCodingOAuthStatusQuery(enabled = true) {
	return useQuery(
		{
			queryKey: [CODING_OAUTH_KEY, "status"],
			queryFn: () => callCodingOAuth(CODING_OAUTH_PATHS.status, CodingOAuthWebStatusSchema),
			enabled,
			refetchInterval: (query) => {
				const data = query.state.data;
				if (data === undefined) return 5_000;
				const signingIn = Object.values(data.providers).some((provider) => provider.status === "signing-in");
				return signingIn ? 2_000 : 30_000;
			},
			retry: 1,
		},
		usageQueryClient,
	);
}

export function useCodingOAuthLoginMutation() {
	return useMutation(
		{
			mutationFn: ({
				provider,
				method,
				accountMode,
				confirmOverwrite,
			}: {
				provider: CodingOAuthProviderSlug;
				method?: string;
				accountMode?: "add" | "overwrite-active";
				confirmOverwrite?: boolean;
			}) =>
				postCodingOAuth(
					CODING_OAUTH_PATHS.login,
					{
						provider,
						...(method === undefined ? {} : { method }),
						...(accountMode === undefined ? {} : { accountMode }),
						...(confirmOverwrite === undefined ? {} : { confirmOverwrite }),
					},
					LoginChallengeSchema,
				),
			onSuccess: invalidateCodingOAuthQueries,
		},
		usageQueryClient,
	);
}

const CodeAcceptedSchema = z.object({ ok: z.literal(true) });

/** Opaque vendor usage document; shape is owned by the upstream provider. */
const CodexUsageSchema = z.record(z.string(), z.unknown());

export function useCodingOAuthCodeMutation() {
	return useMutation(
		{
			mutationFn: ({ provider, code }: { provider: CodingOAuthProviderSlug; code: string }) =>
				postCodingOAuth(CODING_OAUTH_PATHS.code, { provider, code }, CodeAcceptedSchema),
			onSuccess: invalidateCodingOAuthQueries,
		},
		usageQueryClient,
	);
}

export function useCodingOAuthCancelMutation() {
	return useMutation(
		{
			mutationFn: (provider: CodingOAuthProviderSlug) =>
				postCodingOAuth(CODING_OAUTH_PATHS.cancel, { provider }, CodingOAuthWebStatusSchema),
			onSuccess: invalidateCodingOAuthQueries,
		},
		usageQueryClient,
	);
}

export function useCodingOAuthLogoutMutation() {
	return useMutation(
		{
			mutationFn: (provider: CodingOAuthProviderSlug) =>
				postCodingOAuth(CODING_OAUTH_PATHS.logout, { provider }, CodingOAuthWebStatusSchema),
			onSuccess: invalidateCodingOAuthQueries,
		},
		usageQueryClient,
	);
}

export function useCodingOAuthModelsMutation() {
	return useMutation(
		{
			mutationFn: ({ provider, selected }: { provider: CodingOAuthProviderSlug; selected: readonly string[] }) =>
				postCodingOAuth(CODING_OAUTH_PATHS.models, { provider, selected }, CodingOAuthWebStatusSchema),
			onSuccess: invalidateCodingOAuthQueries,
		},
		usageQueryClient,
	);
}

export function useCodingOAuthSetActiveAccountMutation() {
	return useMutation(
		{
			mutationFn: ({ provider, accountId }: { provider: CodingOAuthProviderSlug; accountId: string }) =>
				postCodingOAuth(
					CODING_OAUTH_PATHS.accountsSetActive,
					{ provider, accountId },
					CodingOAuthWebStatusSchema,
				),
			onSuccess: invalidateCodingOAuthQueries,
		},
		usageQueryClient,
	);
}

export function useCodingOAuthRemoveAccountMutation() {
	return useMutation(
		{
			mutationFn: ({ provider, accountId }: { provider: CodingOAuthProviderSlug; accountId: string }) =>
				postCodingOAuth(CODING_OAUTH_PATHS.accountsRemove, { provider, accountId }, CodingOAuthWebStatusSchema),
			onSuccess: invalidateCodingOAuthQueries,
		},
		usageQueryClient,
	);
}

export function useOAuthSourcesQuery(enabled = true) {
	return useQuery(
		{
			queryKey: [CODING_OAUTH_KEY, "sources"],
			queryFn: () => callCodingOAuth(CODING_OAUTH_PATHS.sources, OAuthImportSourcesResponseSchema),
			enabled,
			staleTime: 15_000,
			retry: 1,
		},
		usageQueryClient,
	);
}

export function useOAuthSourcePreviewMutation() {
	return useMutation(
		{
			mutationFn: (kind: OAuthSourceKind): Promise<OAuthImportPreview> =>
				postCodingOAuth(CODING_OAUTH_PATHS.sourcePreview, { kind }, OAuthImportPreviewSchema),
		},
		usageQueryClient,
	);
}

export function useOAuthSourceCommitMutation() {
	return useMutation(
		{
			mutationFn: (input: {
				kind: OAuthSourceKind;
				previewId: string;
				confirmOverwrite?: boolean;
			}): Promise<OAuthImportCommitResult> =>
				postCodingOAuth(CODING_OAUTH_PATHS.sourceCommit, input, OAuthImportCommitResultSchema),
			onSuccess: invalidateCodingOAuthQueries,
		},
		usageQueryClient,
	);
}

export function useOAuthSourceCancelMutation() {
	return useMutation(
		{
			mutationFn: (previewId: string) =>
				postCodingOAuth(CODING_OAUTH_PATHS.sourceCancel, { previewId }, OAuthImportCancelResultSchema),
		},
		usageQueryClient,
	);
}

export function useGatewayStatusQuery(enabled = true) {
	return useQuery(
		{
			queryKey: [CODING_OAUTH_KEY, "gateway"],
			queryFn: () => callCodingOAuth(CODING_OAUTH_PATHS.gateway, GatewayPublicStatusSchema),
			enabled,
			refetchInterval: 15_000,
			retry: 1,
		},
		usageQueryClient,
	);
}

export function useGatewayPatchMutation() {
	return useMutation(
		{
			mutationFn: (patch: { enabled?: boolean; port?: number }): Promise<GatewayPublicStatus> =>
				callCodingOAuth(CODING_OAUTH_PATHS.gateway, GatewayPublicStatusSchema, {
					method: "PATCH",
					body: JSON.stringify(patch),
				}),
			onSuccess: invalidateCodingOAuthQueries,
		},
		usageQueryClient,
	);
}

export function useGatewayRevealMutation() {
	return useMutation(
		{
			mutationFn: () => postCodingOAuth(CODING_OAUTH_PATHS.gatewayReveal, {}, GatewayKeyRevealSchema),
		},
		usageQueryClient,
	);
}

export function useGatewayRotateMutation() {
	return useMutation(
		{
			mutationFn: () => postCodingOAuth(CODING_OAUTH_PATHS.gatewayRotate, {}, GatewayKeyRevealSchema),
			onSuccess: invalidateCodingOAuthQueries,
		},
		usageQueryClient,
	);
}

export function useCapabilitiesQuery(enabled = true) {
	return useQuery(
		{
			queryKey: [CODING_OAUTH_KEY, "capabilities"],
			queryFn: () => callCodingOAuth(CODING_OAUTH_PATHS.capabilities, CapabilitySettingsSnapshotSchema),
			enabled,
			retry: 1,
		},
		usageQueryClient,
	);
}

export function useCapabilitiesPatchMutation() {
	return useMutation(
		{
			mutationFn: ({
				patch,
				expectedRevision,
			}: {
				patch: CapabilitySettingsPatch;
				expectedRevision: number;
			}): Promise<CapabilitySettingsSnapshot> =>
				callCodingOAuth(CODING_OAUTH_PATHS.capabilities, CapabilitySettingsSnapshotSchema, {
					method: "PATCH",
					body: JSON.stringify({ patch, expectedRevision }),
				}),
			onSuccess: invalidateCodingOAuthQueries,
		},
		usageQueryClient,
	);
}

export function useCodexUsageQuery(enabled = true) {
	return useQuery(
		{
			queryKey: [CODING_OAUTH_KEY, "codex-usage"],
			queryFn: () => callCodingOAuth(CODING_OAUTH_PATHS.codexUsage, CodexUsageSchema),
			enabled,
			retry: 1,
		},
		usageQueryClient,
	);
}

export function useImagineCredentialQuery(enabled = true) {
	return useQuery(
		{
			queryKey: [CODING_OAUTH_KEY, "imagine-credential"],
			queryFn: () => callCodingOAuth(CODING_OAUTH_PATHS.imagineCredential, ImagineCredentialStatusSchema),
			enabled,
			retry: 1,
		},
		usageQueryClient,
	);
}

export type { CodingOAuthWebStatus };

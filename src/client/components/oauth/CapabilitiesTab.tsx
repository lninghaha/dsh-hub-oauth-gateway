/**
 * Capabilities tab: the seven default-off optional capability switches plus
 * their conservative numeric limits. Writes go through the revision-bearing
 * CAS envelope; a SETTINGS_CONFLICT answer refetches and asks the user to
 * retry instead of clobbering a newer section.
 */

import { useState } from "react";
import {
	CAPABILITY_FLAG_DEFS,
	CAPABILITY_LIMIT_BOUNDS,
	type CapabilitySettingsPatch,
} from "../../../shared/coding-oauth.js";
import {
	CodingOAuthApiError,
	useCapabilitiesPatchMutation,
	useCapabilitiesQuery,
	useImagineCredentialQuery,
} from "../../coding-oauth-api.js";
import type { Translate } from "../../locales.js";
import { SettingsRow, Toggle } from "../controls.js";

export function CapabilitiesTab({ t }: { readonly t: Translate }) {
	const snapshot = useCapabilitiesQuery();
	const patch = useCapabilitiesPatchMutation();
	const [conflict, setConflict] = useState(false);
	const imagine = useImagineCredentialQuery();
	const data = snapshot.data ?? null;
	const write = (value: CapabilitySettingsPatch): void => {
		if (data === null) return;
		setConflict(false);
		patch.mutate(
			{ patch: value, expectedRevision: data.revision },
			{
				onError: async (error) => {
					if (error instanceof CodingOAuthApiError && error.code === "SETTINGS_CONFLICT") {
						setConflict(true);
						await snapshot.refetch();
					}
				},
			},
		);
	};
	return (
		<div className="dus-settings-stack" data-settings-tab="capabilities">
			<p className="dus-settings-hint">{t("capabilities.intro")}</p>
			{snapshot.error instanceof Error ? (
				<p className="dus-error-inline" role="alert">
					{snapshot.error.message}
				</p>
			) : null}
			{data === null ? (
				<div className="dus-chart-empty">{t("dashboard.loading")}</div>
			) : (
				<>
					{data.writable ? null : <p className="dus-row-hint">{t("capabilities.readonly")}</p>}
					{conflict ? (
						<p className="dus-row-hint" role="alert">
							{t("capabilities.conflict")}
						</p>
					) : null}
					{patch.isSuccess ? <p className="dus-save-state">{t("capabilities.saved")}</p> : null}
					{CAPABILITY_FLAG_DEFS.map((flag) => (
						<SettingsRow
							key={flag.key}
							title={t(flag.labelKey)}
							hint={t(`${flag.labelKey}Hint`)}
							control={
								<Toggle
									label={t(flag.labelKey)}
									checked={data.value[flag.key]}
									disabled={!data.writable || patch.isPending}
									onChange={(next) => write({ [flag.key]: next })}
								/>
							}
						/>
					))}
					<SettingsRow
						title={t("capabilities.searchResults")}
						control={
							<input
								className="dus-input dus-input-narrow"
								type="number"
								min={CAPABILITY_LIMIT_BOUNDS.searchResults.min}
								max={CAPABILITY_LIMIT_BOUNDS.searchResults.max}
								step={1}
								value={data.value.searchResults}
								aria-label={t("capabilities.searchResults")}
								disabled={!data.writable || patch.isPending}
								onChange={(event) => {
									const next = Math.trunc(Number(event.target.value));
									if (
										Number.isInteger(next) &&
										next >= CAPABILITY_LIMIT_BOUNDS.searchResults.min &&
										next <= CAPABILITY_LIMIT_BOUNDS.searchResults.max
									) {
										write({ searchResults: next });
									}
								}}
							/>
						}
					/>
					<SettingsRow
						title={t("capabilities.imageCount")}
						control={
							<input
								className="dus-input dus-input-narrow"
								type="number"
								min={CAPABILITY_LIMIT_BOUNDS.imageCount.min}
								max={CAPABILITY_LIMIT_BOUNDS.imageCount.max}
								step={1}
								value={data.value.imageCount}
								aria-label={t("capabilities.imageCount")}
								disabled={!data.writable || patch.isPending}
								onChange={(event) => {
									const next = Math.trunc(Number(event.target.value));
									if (
										Number.isInteger(next) &&
										next >= CAPABILITY_LIMIT_BOUNDS.imageCount.min &&
										next <= CAPABILITY_LIMIT_BOUNDS.imageCount.max
									) {
										write({ imageCount: next });
									}
								}}
							/>
						}
					/>
					<SettingsRow
						title={t("capabilities.videoTtl")}
						hint={t("capabilities.videoTtlHint")}
						control={
							<input
								className="dus-input dus-input-narrow"
								type="number"
								min={CAPABILITY_LIMIT_BOUNDS.videoArtifactTtlHours.min}
								max={CAPABILITY_LIMIT_BOUNDS.videoArtifactTtlHours.max}
								step={1}
								value={Math.round(data.value.videoArtifactTtlMs / 3_600_000)}
								aria-label={t("capabilities.videoTtl")}
								disabled={!data.writable || patch.isPending}
								onChange={(event) => {
									const hours = Math.trunc(Number(event.target.value));
									if (
										Number.isInteger(hours) &&
										hours >= CAPABILITY_LIMIT_BOUNDS.videoArtifactTtlHours.min &&
										hours <= CAPABILITY_LIMIT_BOUNDS.videoArtifactTtlHours.max
									) {
										write({ videoArtifactTtlMs: hours * 3_600_000 });
									}
								}}
							/>
						}
					/>
					<SettingsRow
						title={t("capabilities.imagineCredential")}
						hint={
							imagine.data === undefined
								? t("dashboard.loading")
								: imagine.data.configured
									? t("capabilities.imagineConfigured", { source: imagine.data.source })
									: t("capabilities.imagineMissing")
						}
					/>
					{patch.error instanceof Error && !conflict ? (
						<p className="dus-error-inline" role="alert">
							{patch.error.message}
						</p>
					) : null}
				</>
			)}
		</div>
	);
}

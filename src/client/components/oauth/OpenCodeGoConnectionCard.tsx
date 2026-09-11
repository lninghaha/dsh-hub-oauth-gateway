import { useEffect, useMemo, useState } from "react";
import type { OpenCodeGoModel } from "../../../shared/coding-oauth.js";
import {
	useOpenCodeGoApplyMutation,
	useOpenCodeGoConnectionQuery,
	useOpenCodeGoCredentialMutation,
	useOpenCodeGoModelsMutation,
} from "../../coding-oauth-api.js";
import type { Translate } from "../../locales.js";
import { SettingsRow } from "../controls.js";

function errorText(error: unknown): string | null {
	return error instanceof Error ? error.message : null;
}

export function OpenCodeGoConnectionCard({
	t,
	onStartConversation,
}: {
	readonly t: Translate;
	readonly onStartConversation: () => void;
}) {
	const status = useOpenCodeGoConnectionQuery();
	const credential = useOpenCodeGoCredentialMutation();
	const directory = useOpenCodeGoModelsMutation();
	const apply = useOpenCodeGoApplyMutation();
	const [credentialRef, setCredentialRef] = useState("OPENCODE_GO_API_KEY");
	const [apiKey, setApiKey] = useState("");
	const [modelId, setModelId] = useState("");
	const [confirmConflicts, setConfirmConflicts] = useState(false);

	const current = apply.data ?? credential.data ?? directory.data?.status ?? status.data;
	useEffect(() => {
		if (current === undefined) return;
		setCredentialRef((previous) =>
			current.credential.candidates.some((candidate) => candidate.ref === previous)
				? previous
				: current.credential.selectedRef,
		);
	}, [current]);
	const models = useMemo(
		() => directory.data?.models ?? current?.configuration.models ?? [],
		[current, directory.data],
	);
	useEffect(() => {
		if (modelId !== "" || models.length === 0) return;
		setModelId(
			models.some((model) => model.id === "deepseek-v4.1-flash") ? "deepseek-v4.1-flash" : (models[0]?.id ?? ""),
		);
	}, [modelId, models]);

	const chosenModel: OpenCodeGoModel | undefined =
		models.find((model) => model.id === modelId) ?? (modelId.trim() === "" ? undefined : { id: modelId.trim() });
	const pending = credential.isPending || directory.isPending || apply.isPending;
	const error =
		errorText(credential.error) ?? errorText(directory.error) ?? errorText(apply.error) ?? errorText(status.error);

	return (
		<article className="dus-oauth-card" data-opencode-go-status={current?.call.lastCall ?? "loading"}>
			<div className="dus-oauth-card-body">
				<SettingsRow
					title={t("oauth.opencodeGo.title")}
					hint={
						current === undefined
							? t("dashboard.loading")
							: t(`oauth.opencodeGo.status.${current.call.lastCall}` as const)
					}
					control={
						<span className={`dus-state-dot${current?.configuration.ready ? " is-ok" : ""}`} aria-hidden="true" />
					}
				/>
			<p className="dus-row-hint">{t("oauth.opencodeGo.description")}</p>
			<p className="dus-row-hint">{t("oauth.opencodeGo.compatibilityNote")}</p>

				<div className="dus-settings-stack">
					<label className="dus-field">
						<span>{t("oauth.opencodeGo.credential")}</span>
						<select value={credentialRef} disabled={pending} onChange={(event) => setCredentialRef(event.target.value)}>
							{(current?.credential.candidates ?? [{ ref: credentialRef, configured: false }]).map((candidate) => (
								<option key={candidate.ref} value={candidate.ref}>
									{candidate.ref}
									{"configured" in candidate && candidate.configured ? ` · ${t("oauth.opencodeGo.configured")}` : ""}
								</option>
							))}
						</select>
					</label>
					{current?.credential.requiresChoice ? (
						<p className="dus-inline-notice is-warning">{t("oauth.opencodeGo.chooseCredential")}</p>
					) : null}
					<label className="dus-field">
						<span>{t("oauth.opencodeGo.apiKey")}</span>
						<input
							type="password"
							autoComplete="off"
							value={apiKey}
							disabled={pending}
							placeholder={current?.credential.configured ? t("oauth.opencodeGo.reuseHint") : "sk-…"}
							onChange={(event) => setApiKey(event.target.value)}
						/>
					</label>
					<div className="dus-inline-actions">
						<button
							type="button"
							className="dus-button is-small"
							disabled={pending || (apiKey === "" && current?.credential.configured !== true)}
							onClick={() =>
								credential.mutate(
									{ credentialRef, ...(apiKey === "" ? {} : { apiKey }) },
									{ onSuccess: () => setApiKey("") },
								)
							}
						>
							{apiKey === "" ? t("oauth.opencodeGo.reuse") : t("oauth.opencodeGo.saveKey")}
						</button>
						<button
							type="button"
							className="dus-button is-small"
							disabled={pending || current?.credential.configured !== true}
							onClick={() => directory.mutate(credentialRef)}
						>
							{t("oauth.opencodeGo.fetchModels")}
						</button>
					</div>

					<label className="dus-field">
						<span>{t("oauth.opencodeGo.model")}</span>
						<input
							list="opencode-go-models"
							value={modelId}
							disabled={pending}
							onChange={(event) => setModelId(event.target.value)}
						/>
						<datalist id="opencode-go-models">
							{models.map((model) => (
								<option key={model.id} value={model.id}>
									{model.name ?? model.id}
								</option>
							))}
						</datalist>
					</label>
					{(current?.configuration.conflicts.length ?? 0) > 0 ? (
						<div className="dus-inline-notice is-warning">
							<p>
								{t("oauth.opencodeGo.conflictPreview", {
									conflicts: current?.configuration.conflicts.join(", ") ?? "",
								})}
							</p>
							<label>
								<input
									type="checkbox"
									checked={confirmConflicts}
									onChange={(event) => setConfirmConflicts(event.target.checked)}
								/>{" "}
								{t("oauth.opencodeGo.confirmConflict")}
							</label>
						</div>
					) : null}
					<div className="dus-inline-actions">
						<button
							type="button"
							className="dus-button is-small is-primary"
							disabled={
								pending ||
								chosenModel === undefined ||
								current?.credential.configured !== true ||
								current?.configuration.revision == null ||
								((current?.configuration.conflicts.length ?? 0) > 0 && !confirmConflicts)
							}
							onClick={() => {
								const expectedRevision = current?.configuration.revision;
								if (chosenModel === undefined || expectedRevision == null) return;
								apply.mutate({
									credentialRef,
									model: chosenModel,
									expectedRevision,
									confirmConflicts,
								});
							}}
						>
							{t("oauth.opencodeGo.apply")}
						</button>
						{apply.data?.configuration.ready ? (
							<button type="button" className="dus-button is-small" onClick={onStartConversation}>
								{t("oauth.opencodeGo.startConversation")}
							</button>
						) : null}
					</div>
					{error === null ? null : (
						<p className="dus-inline-error" role="alert">
							{error}
						</p>
					)}
				</div>
			</div>
		</article>
	);
}

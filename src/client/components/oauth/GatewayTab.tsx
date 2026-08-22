/** Controls the opt-in loopback OpenAI/Anthropic-compatible OAuth gateway. */
import { useState } from "react";
import {
	useGatewayPatchMutation,
	useGatewayRevealMutation,
	useGatewayRotateMutation,
	useGatewayStatusQuery,
} from "../../coding-oauth-api.js";
import type { Translate } from "../../locales.js";
import { SettingsRow, Toggle } from "../controls.js";

const RANDOM_PORT_MIN = 18_100;
const RANDOM_PORT_MAX = 18_999;
type SnippetId = "curl" | "python" | "node" | "cursor";

function randomPort(): number {
	return RANDOM_PORT_MIN + Math.floor(Math.random() * (RANDOM_PORT_MAX - RANDOM_PORT_MIN + 1));
}

function CopyButton({
	value,
	disabled,
	t,
}: {
	readonly value: string;
	readonly disabled?: boolean;
	readonly t: Translate;
}) {
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState(false);
	const copy = async (): Promise<void> => {
		try {
			const writeText = navigator.clipboard?.writeText;
			if (typeof writeText !== "function") throw new Error("clipboard API is unavailable");
			await writeText.call(navigator.clipboard, value);
			setCopied(true);
			setError(false);
			setTimeout(() => setCopied(false), 1_600);
		} catch {
			setError(true);
		}
	};
	return (
		<span className="dus-copy-action">
			<button type="button" className="dus-button is-small" disabled={disabled} onClick={() => void copy()}>
				{copied ? t("gateway.copied") : t("gateway.copy")}
			</button>
			{error ? (
				<span className="dus-error-inline" role="alert">
					{t("gateway.copyFailed")}
				</span>
			) : null}
		</span>
	);
}

function buildSnippets(bind: string, port: number, model: string, apiKey: string): Record<SnippetId, string> {
	const openaiBase = `http://${bind}:${port}/v1`;
	const anthropicBase = `http://${bind}:${port}`;
	return {
		curl: `curl ${openaiBase}/chat/completions \\\n  -H "Authorization: Bearer ${apiKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${model}","messages":[{"role":"user","content":"Hello"}]}'`,
		python: `from openai import OpenAI

client = OpenAI(base_url="${openaiBase}", api_key="${apiKey}")
response = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Hello"}],
)
print(response.choices[0].message.content)`,
		node: `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${openaiBase}", apiKey: "${apiKey}" });
const response = await client.chat.completions.create({
  model: "${model}", messages: [{ role: "user", content: "Hello" }],
});
console.log(response.choices[0]?.message?.content);`,
		cursor: `{
  "openai.api.baseUrl": "${openaiBase}",
  "openai.api.key": "${apiKey}",
  "anthropic.api.baseUrl": "${anthropicBase}",
  "anthropic.api.key": "${apiKey}"
}`,
	};
}

function GatewaySnippets({
	bind,
	port,
	model,
	keyAvailable,
	apiKey,
	t,
}: {
	readonly bind: string;
	readonly port: number;
	readonly model: string | null;
	readonly keyAvailable: boolean;
	readonly apiKey: string;
	readonly t: Translate;
}) {
	const [active, setActive] = useState<SnippetId>("curl");
	const ready = model !== null && apiKey !== "";
	const snippets = model === null ? null : buildSnippets(bind, port, model, apiKey);
	const tabs: readonly { id: SnippetId; label: string }[] = [
		{ id: "curl", label: "cURL" },
		{ id: "python", label: "Python" },
		{ id: "node", label: "Node.js" },
		{ id: "cursor", label: t("gateway.snippet.cursor") },
	];
	const message =
		model === null
			? t("gateway.snippetsModelMissing")
			: keyAvailable
				? t("gateway.snippetsKeyHidden")
				: t("gateway.snippetsKeyMissing");
	return (
		<section className="dus-gateway-snippets">
			<h3 className="dus-settings-subtitle">{t("gateway.snippetsTitle")}</h3>
			<p className="dus-row-hint">{t("gateway.snippetsHint")}</p>
			<nav className="dus-snippet-tabs" aria-label={t("gateway.snippetsTitle")}>
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						className={`dus-tab${active === tab.id ? " is-active" : ""}`}
						onClick={() => setActive(tab.id)}
					>
						{tab.label}
					</button>
				))}
			</nav>
			<div className="dus-snippet-panel">
				{ready && snippets !== null ? (
					<>
						<pre>{snippets[active]}</pre>
						<CopyButton value={snippets[active]} t={t} />
					</>
				) : (
					<p className="dus-row-hint" role="status">
						{message}
					</p>
				)}
			</div>
		</section>
	);
}

function Retry({
	error,
	onRetry,
	t,
}: {
	readonly error: unknown;
	readonly onRetry: () => void;
	readonly t: Translate;
}) {
	return error instanceof Error ? (
		<p className="dus-error-inline" role="alert">
			{error.message}
			<button type="button" className="dus-button is-small" onClick={onRetry}>
				{t("action.retry")}
			</button>
		</p>
	) : null;
}

export function GatewayTab({ t }: { readonly t: Translate }) {
	const status = useGatewayStatusQuery();
	const patch = useGatewayPatchMutation();
	const reveal = useGatewayRevealMutation();
	const rotate = useGatewayRotateMutation();
	const [portDraft, setPortDraft] = useState<string | null>(null);
	const [confirmRotate, setConfirmRotate] = useState(false);
	const [lastPatch, setLastPatch] = useState<{ enabled?: boolean; port?: number } | null>(null);
	const data = status.data ?? null;
	const portValue = portDraft ?? (data === null ? "" : String(data.port));
	const portNumber = Number(portValue);
	const portValid = Number.isInteger(portNumber) && portNumber >= 1024 && portNumber <= 65_535;
	const runPatch = (next: { enabled?: boolean; port?: number }): void => {
		setLastPatch(next);
		patch.mutate(next, {
			onSuccess: () => {
				if (next.port !== undefined) setPortDraft(null);
			},
		});
	};
	const revealedKey =
		reveal.data === undefined && rotate.data === undefined ? "" : ((rotate.data ?? reveal.data)?.apiKey ?? "");
	return (
		<div className="dus-settings-stack" data-settings-tab="gateway">
			<p className="dus-settings-hint">{t("gateway.intro")}</p>
			{status.error instanceof Error ? (
				<p className="dus-error-inline" role="alert">
					{status.error.message}
					<button type="button" className="dus-button is-small" onClick={() => void status.refetch()}>
						{t("action.retry")}
					</button>
				</p>
			) : null}
			{data === null && status.isPending ? (
				<div className="dus-chart-empty">{t("dashboard.loading")}</div>
			) : data !== null ? (
				<>
					<p className="dus-gateway-warning" role="note">
						{data.warning}
					</p>
					<SettingsRow
						title={t("gateway.enabled")}
						hint={data.running ? t("gateway.running") : t("gateway.stopped")}
						control={
							<Toggle
								label={t("gateway.enabled")}
								checked={data.enabled}
								disabled={patch.isPending}
								onChange={(enabled) => runPatch({ enabled })}
							/>
						}
					/>
					<Retry
						error={patch.error}
						onRetry={() => {
							if (lastPatch !== null) runPatch(lastPatch);
						}}
						t={t}
					/>
					<SettingsRow title={t("gateway.bind")} hint={t("gateway.bindHint")} control={<code>{data.bind}</code>} />
					<div className="dus-row">
						<div className="dus-row-text">
							<div className="dus-row-title">{t("gateway.port")}</div>
						</div>
						<div className="dus-inline-actions">
							<input
								className="dus-input dus-input-narrow"
								value={portValue}
								aria-label={t("gateway.port")}
								inputMode="numeric"
								onChange={(event) => setPortDraft(event.target.value)}
							/>
							<button
								type="button"
								className="dus-button"
								disabled={patch.isPending}
								onClick={() => setPortDraft(String(randomPort()))}
							>
								{t("gateway.portRandom")}
							</button>
							<button
								type="button"
								className="dus-button is-primary"
								disabled={patch.isPending || !portValid || portNumber === data.port}
								onClick={() => runPatch({ port: portNumber })}
							>
								{t("gateway.portApply")}
							</button>
						</div>
					</div>
					<SettingsRow
						title={t("gateway.baseUrlOpenai")}
						control={
							<span className="dus-inline-actions">
								<code>{`http://${data.bind}:${data.port}/v1`}</code>
								<CopyButton value={`http://${data.bind}:${data.port}/v1`} t={t} />
							</span>
						}
					/>
					<SettingsRow
						title={t("gateway.baseUrlAnthropic")}
						control={
							<span className="dus-inline-actions">
								<code>{`http://${data.bind}:${data.port}`}</code>
								<CopyButton value={`http://${data.bind}:${data.port}`} t={t} />
							</span>
						}
					/>
					<div className="dus-row">
						<div className="dus-row-text">
							<div className="dus-row-title">{t("gateway.apiKey")}</div>
							<div className="dus-row-hint">
								{revealedKey === "" ? (data.keyAvailable ? data.keyHint : t("gateway.keyAbsent")) : revealedKey}
							</div>
						</div>
						<div className="dus-inline-actions">
							<button
								type="button"
								className="dus-button"
								disabled={reveal.isPending || !data.keyAvailable}
								onClick={() => reveal.mutate()}
							>
								{t("gateway.reveal")}
							</button>
							{confirmRotate ? (
								<>
									<button
										type="button"
										className="dus-button is-danger"
										disabled={rotate.isPending}
										onClick={() => rotate.mutate(undefined, { onSuccess: () => setConfirmRotate(false) })}
									>
										{t("gateway.rotateConfirm")}
									</button>
									<button type="button" className="dus-button" onClick={() => setConfirmRotate(false)}>
										{t("action.close")}
									</button>
								</>
							) : (
								<button type="button" className="dus-button" onClick={() => setConfirmRotate(true)}>
									{t("gateway.rotate")}
								</button>
							)}
						</div>
					</div>
					<Retry error={reveal.error} onRetry={() => reveal.mutate()} t={t} />
					<Retry error={rotate.error} onRetry={() => rotate.mutate()} t={t} />
					<GatewaySnippets
						bind={data.bind}
						port={data.port}
						model={data.model}
						keyAvailable={data.keyAvailable}
						apiKey={revealedKey}
						t={t}
					/>
				</>
			) : null}
		</div>
	);
}

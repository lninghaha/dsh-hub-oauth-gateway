/**
 * Gateway tab: controls the opt-in loopback OpenAI/Anthropic-compatible API
 * gateway backed by the signed-in OAuth sessions. The bind address stays a
 * YAML-only setting; this panel manages enabled state, port, and the Bearer
 * key lifecycle (reveal / rotate with confirmation).
 */

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

function randomPort(): number {
	return RANDOM_PORT_MIN + Math.floor(Math.random() * (RANDOM_PORT_MAX - RANDOM_PORT_MIN + 1));
}

function CopyButton({ value, t }: { readonly value: string; readonly t: Translate }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			className="dus-button is-small"
			onClick={() => {
				void navigator.clipboard?.writeText(value).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1_600);
				});
			}}
		>
			{copied ? t("gateway.copied") : t("gateway.copy")}
		</button>
	);
}

type SnippetId = "curl" | "python" | "node" | "cursor";

function buildSnippets(bind: string, port: number, apiKey: string): Record<SnippetId, string> {
	const openaiBase = `http://${bind}:${port}/v1`;
	const anthropicBase = `http://${bind}:${port}`;
	const key = apiKey || "YOUR_GATEWAY_KEY";
	return {
		curl: `curl ${openaiBase}/chat/completions \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'`,
		python: `from openai import OpenAI

client = OpenAI(base_url="${openaiBase}", api_key="${key}")
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
)
print(response.choices[0].message.content)`,
		node: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${openaiBase}",
  apiKey: "${key}",
});
const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
});
console.log(response.choices[0]?.message?.content);`,
		cursor: `{
  "openai.api.baseUrl": "${openaiBase}",
  "openai.api.key": "${key}",
  "anthropic.api.baseUrl": "${anthropicBase}",
  "anthropic.api.key": "${key}"
}`,
	};
}

function GatewaySnippets({
	bind,
	port,
	apiKey,
	t,
}: {
	readonly bind: string;
	readonly port: number;
	readonly apiKey: string;
	readonly t: Translate;
}) {
	const [active, setActive] = useState<SnippetId>("curl");
	const snippets = buildSnippets(bind, port, apiKey);
	const tabs: readonly { id: SnippetId; label: string }[] = [
		{ id: "curl", label: "cURL" },
		{ id: "python", label: "Python" },
		{ id: "node", label: "Node.js" },
		{ id: "cursor", label: t("gateway.snippet.cursor") },
	];
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
				<pre>{snippets[active]}</pre>
				<CopyButton value={snippets[active]} t={t} />
			</div>
		</section>
	);
}

export function GatewayTab({ t }: { readonly t: Translate }) {
	const status = useGatewayStatusQuery();
	const patch = useGatewayPatchMutation();
	const reveal = useGatewayRevealMutation();
	const rotate = useGatewayRotateMutation();
	const [portDraft, setPortDraft] = useState<string | null>(null);
	const [confirmRotate, setConfirmRotate] = useState(false);
	const data = status.data ?? null;
	const portValue = portDraft ?? (data === null ? "" : String(data.port));
	const portNumber = Number(portValue);
	const portValid = Number.isInteger(portNumber) && portNumber >= 1024 && portNumber <= 65_535;
	const operationError = [patch.error, reveal.error, rotate.error].find(
		(value): value is Error => value instanceof Error,
	);
	const revealedKey =
		reveal.data === undefined && rotate.data === undefined ? "" : ((rotate.data ?? reveal.data)?.apiKey ?? "");
	return (
		<div className="dus-settings-stack" data-settings-tab="gateway">
			<p className="dus-settings-hint">{t("gateway.intro")}</p>
			{status.error instanceof Error ? (
				<p className="dus-error-inline" role="alert">
					{status.error.message}
				</p>
			) : null}
			{data === null ? (
				<div className="dus-chart-empty">{t("dashboard.loading")}</div>
			) : (
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
								onChange={(enabled) => patch.mutate({ enabled })}
							/>
						}
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
								onClick={() => patch.mutate({ port: portNumber }, { onSuccess: () => setPortDraft(null) })}
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
								{reveal.data === undefined && rotate.data === undefined
									? data.keyHint === ""
										? t("gateway.keyAbsent")
										: data.keyHint
									: (rotate.data ?? reveal.data)?.apiKey}
							</div>
						</div>
						<div className="dus-inline-actions">
							<button type="button" className="dus-button" disabled={reveal.isPending} onClick={() => reveal.mutate()}>
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
					{operationError === undefined ? null : (
						<p className="dus-error-inline" role="alert">
							{operationError.message}
						</p>
					)}
					<GatewaySnippets bind={data.bind} port={data.port} apiKey={revealedKey} t={t} />
				</>
			)}
		</div>
	);
}

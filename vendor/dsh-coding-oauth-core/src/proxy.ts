/** Process-wide, reference-counted egress proxy shared by every participant. */

import { Dispatcher, getGlobalDispatcher, ProxyAgent, setGlobalDispatcher } from "undici";

const DEFAULT_PROXIED_HOSTS = [
	"auth.x.ai",
	"cli-chat-proxy.grok.com",
	"auth.openai.com",
	"chatgpt.com",
	"claude.ai",
	"platform.claude.com",
	"api.anthropic.com",
	"accounts.google.com",
	"oauth2.googleapis.com",
	"cloudcode-pa.googleapis.com",
	"www.googleapis.com",
] as const;

const KIMI_PROXIED_HOSTS = ["auth.kimi.com", "api.kimi.com"] as const;

class CodingOAuthDispatcher extends Dispatcher {
	constructor(
		private readonly proxied: Dispatcher,
		private readonly fallback: Dispatcher,
		private readonly hosts: ReadonlySet<string>,
	) {
		super();
	}

	dispatch(options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
		const origin = options.origin;
		const host = origin instanceof URL ? origin.hostname : typeof origin === "string" ? new URL(origin).hostname : "";
		return this.hosts.has(host)
			? this.proxied.dispatch(options, handler)
			: this.fallback.dispatch(options, handler);
	}

	override async close(): Promise<void> {
		await this.proxied.close();
	}

	override async destroy(): Promise<void> {
		await this.proxied.destroy();
	}
}

const PROXY_ABI = "dsh.coding-oauth-core.proxy/v1" as const;
const PROXY_STORE_SYMBOL = Symbol.for(`${PROXY_ABI}/store`);

interface ActiveProxy {
	readonly dispatcher: Dispatcher;
	readonly fallback: Dispatcher;
	readonly fingerprint: string;
	readonly url: string;
	refs: number;
}

interface ProxyStore {
	readonly abi: typeof PROXY_ABI;
	active?: ActiveProxy;
}

export interface CodingOAuthProxyLease {
	readonly url: string | undefined;
	release(): Promise<void>;
}

export interface CodingOAuthProxyOptions {
	readonly proxyKimi?: boolean;
}

let legacyLease: CodingOAuthProxyLease | undefined;

function firstEnvironmentValue(names: readonly string[]): string | undefined {
	for (const name of names) {
		const value = process.env[name];
		if (value !== undefined && value.length > 0) return value;
	}
	return undefined;
}

function proxyStore(): ProxyStore {
	const host = globalThis as typeof globalThis & Record<symbol, unknown>;
	const existing = host[PROXY_STORE_SYMBOL];
	if (existing !== undefined) {
		const store = existing as Partial<ProxyStore>;
		if (store.abi !== PROXY_ABI) throw new Error("coding OAuth proxy ABI is incompatible");
		return store as ProxyStore;
	}
	const created: ProxyStore = { abi: PROXY_ABI };
	Object.defineProperty(host, PROXY_STORE_SYMBOL, {
		value: created,
		configurable: false,
		enumerable: false,
		writable: false,
	});
	return created;
}

/** Acquire the audited dispatcher and restore its predecessor on final release. */
export function acquireCodingOAuthProxy(
	explicit?: string,
	options: CodingOAuthProxyOptions = {},
): CodingOAuthProxyLease {
	const url =
		explicit ??
		firstEnvironmentValue([
			"CODING_OAUTH_PROXY",
			"GROK_BUILD_PROXY",
			"HTTPS_PROXY",
			"https_proxy",
			"HTTP_PROXY",
			"http_proxy",
		]);
	if (url === undefined) return { url: undefined, release: async () => undefined };

	const hosts = new Set<string>(DEFAULT_PROXIED_HOSTS);
	if (options.proxyKimi === true) {
		for (const host of KIMI_PROXIED_HOSTS) hosts.add(host);
	}
	const fingerprint = `${url}\n${[...hosts].sort().join("\n")}`;
	const store = proxyStore();
	if (store.active !== undefined) {
		if (store.active.fingerprint !== fingerprint) {
			throw new Error("another coding OAuth owner already installed a different proxy policy");
		}
		store.active.refs += 1;
		return proxyLease(store, store.active);
	}

	const fallback = getGlobalDispatcher();
	const dispatcher = new CodingOAuthDispatcher(new ProxyAgent(url), fallback, hosts);
	const active: ActiveProxy = { dispatcher, fallback, fingerprint, url, refs: 1 };
	store.active = active;
	setGlobalDispatcher(dispatcher);
	return proxyLease(store, active);
}

function proxyLease(store: ProxyStore, active: ActiveProxy): CodingOAuthProxyLease {
	let released = false;
	return {
		url: active.url,
		async release() {
			if (released) return;
			released = true;
			active.refs -= 1;
			if (active.refs > 0 || store.active !== active) return;
			if (getGlobalDispatcher() === active.dispatcher) setGlobalDispatcher(active.fallback);
			delete store.active;
			await active.dispatcher.close();
		},
	};
}

/** Backward-compatible process-lifetime install retained for CLI callers. */
export function ensureCodingOAuthProxy(
	explicit?: string,
	options: CodingOAuthProxyOptions = {},
): string | undefined {
	legacyLease ??= acquireCodingOAuthProxy(explicit, options);
	return legacyLease.url;
}

/** Backward-compatible name retained for existing callers. */
export function ensureGrokBuildProxy(explicit?: string): string | undefined {
	return ensureCodingOAuthProxy(explicit);
}

export function codingOAuthProxyInEffect(): string | undefined {
	return proxyStore().active?.url;
}

/** Append only a non-secret troubleshooting hint to transport failures. */
export function codingOAuthProxyUnreachableHint(): string {
	return codingOAuthProxyInEffect() === undefined ? "" : "; check that CODING_OAUTH_PROXY is reachable";
}

/** Backward-compatible status accessor. */
export function grokBuildProxyInEffect(): string | undefined {
	return codingOAuthProxyInEffect();
}

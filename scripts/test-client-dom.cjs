/**
 * Stateful DOM regression test for the browser bundle (jsdom + react-dom/client).
 *
 * The static smoke test only renders the CLOSED panel; a 2026-08-16 regression
 * (`hiddenSet` ReferenceError in the open render path) crashed the panel on the
 * first click and React unmounted the sidebar entry with no diagnostics. This
 * suite mounts UsageStatsPanel for real, clicks the badge, walks every flyout,
 * and fails on any console.error. It also verifies the PanelErrorBoundary
 * fallback keeps rendering (and logging) when a child throws.
 */
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://127.0.0.1:3080/" });
global.window = dom.window;
global.document = dom.window.document;
global.Node = dom.window.Node;
global.navigator = dom.window.navigator;
global.localStorage = dom.window.localStorage;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.IS_REACT_ACT_ENVIRONMENT = true;

const react = require("react");
const { createRoot } = require("react-dom/client");
const { act } = require("react");

const registry = {};
window.__ModuleLoader__ = { load: (record) => { registry[record.id] = record; } };
const Stub = (props) => props?.children ?? null;
const primitives = new Proxy({}, { get: () => Stub });

const src = fs.readFileSync(path.join(__dirname, "..", "lib", "client.js"), "utf8");
new Function("window", src)(window);
const exports_ = registry["dsh-usage-stats"].factory((spec) => {
	if (spec === "react") return react;
	if (spec === "react/jsx-runtime") return require("react/jsx-runtime");
	if (spec === "@deepseek-ai/dsh-client-ui-primitives") return primitives;
	throw new Error(`unexpected require: ${spec}`);
});

const NOW = Date.now();
const RESET_SOON = new Date(NOW + 4 * 3600e3 + 16 * 60e3).toISOString();
const providersFixture = {
	ok: true,
	providers: [
		{ id: "opencode-go", displayName: "OpenCode Go", adapter: "opencode-go", accountMode: "subscription", configured: true, status: "ok", plan: "Go", nextResetAt: RESET_SOON, windows: [
			{ kind: "session", usedPercent: 4, remainingPercent: 96, resetsAt: RESET_SOON },
			{ kind: "weekly", usedPercent: 54, remainingPercent: 46, resetsAt: RESET_SOON },
			{ kind: "monthly", usedPercent: 32, remainingPercent: 68, resetsAt: RESET_SOON }
		], balance: null, stale: false, fetchedAt: NOW, alert: { level: "normal" } },
		{ id: "deepseek-official", displayName: "DeepSeek", adapter: "deepseek-balance", accountMode: "balance", configured: true, status: "ok", plan: null, nextResetAt: null, windows: [], balance: { remaining: 36.44, total: 50, used: 13.56, currency: "CNY", unlimited: false }, stale: false, fetchedAt: NOW, alert: { level: "normal" } },
		{ id: "minimax-cn", displayName: "MiniMax CN", adapter: "minimax-token-plan", accountMode: "subscription", configured: true, status: "unsupported", plan: "MiniMax Coding Plan", nextResetAt: null, windows: [], balance: null, stale: false, fetchedAt: NOW, alert: { level: "unknown" } },
		{ id: "openai", displayName: "OpenAI", adapter: null, accountMode: null, configured: false, status: "pending", plan: null, nextResetAt: null, windows: [], balance: null, stale: false, fetchedAt: null, alert: { level: "unknown" } },
		{ id: "zai", displayName: "Z.ai", adapter: "zai-token-plan", accountMode: "subscription", configured: false, status: "not-configured", missingCredentials: ["ZAI_API_KEY"], plan: null, nextResetAt: null, windows: [], balance: null, stale: false, fetchedAt: null, alert: { level: "unknown" } }
	]
};
const today = new Date();
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const usageFixture = {
	ok: true,
	days: [
		{ date: dayKey(today), tokens: 1200000, cacheHitRate: 0.987, models: [{ provider: "deepseek-official", model: "deepseek-chat", tokens: 900000, input: 300000, output: 100000, cacheRead: 500000, cacheHitRate: 0.98 }, { provider: "ark", model: "deepseek-chat", tokens: 300000, input: 200000, output: 100000, cacheRead: 0, cacheHitRate: null }] },
		{ date: dayKey(new Date(NOW - 86400e3)), tokens: 400000, cacheHitRate: 0.5, models: [] }
	],
	total: { tokens: 42000000 }
};
const prefsFixture = { ok: true, prefs: { version: 1, hiddenProviders: [], density: "detailed", historyMode: "daily" } };
const accountFixture = { ok: true, account: { ...providersFixture.providers[0], mode: "subscription" } };

const payloads = {
	"/api/usage-stats/usage": usageFixture,
	"/api/usage-stats/providers": providersFixture,
	"/api/usage-stats/prefs": prefsFixture,
	"/api/usage-stats/account": accountFixture
};
global.fetch = window.fetch = async (url) => {
	const key = Object.keys(payloads).find((k) => String(url).startsWith(k));
	if (!key) throw new Error(`unexpected fetch: ${url}`);
	return { ok: true, status: 200, json: async () => payloads[key] };
};

const errors = [];
const origError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(" ")); origError(...args); };

const click = async (el) => act(async () => {
	el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
	await new Promise((r) => setTimeout(r, 30));
});
const assert = (cond, message) => { if (!cond) throw new Error(message); };

(async () => {
	const { UsageStatsPanel, PanelErrorBoundary } = exports_;
	assert(typeof PanelErrorBoundary === "function", "PanelErrorBoundary must be exported");
	const t = (key) => key;

	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	await act(async () => { root.render(react.createElement(UsageStatsPanel, { wide: true, t })); });
	const badge = container.querySelector("[data-usage-stats-badge]");
	assert(badge !== null, "sidebar badge must render");

	await click(badge);
	assert(container.querySelector("[data-usage-stats-badge]") !== null, "badge must survive the open click (2026-08-16 crash regression)");
	assert(container.querySelector("[data-usage-stats-panel]") !== null, "panel must open on badge click");
	const rows = container.querySelectorAll(".usg_providerRow");
	assert(rows.length === 5, `expected 5 provider rows, got ${rows.length}`);

	await click(rows[0]);
	const flyout = container.querySelector('[data-kind="account"]');
	assert(flyout !== null, "account flyout must open from a provider row");
	assert((flyout.innerHTML.match(/role="progressbar"/g) ?? []).length === 3, "subscription flyout renders three quota meters");

	const historyBtn = container.querySelector(".usg_footerAction");
	assert(historyBtn !== null, "history footer action must exist");
	await click(historyBtn);
	const history = container.querySelector('[data-kind="history"]');
	assert(history !== null, "history flyout must open");
	assert((history.innerHTML.match(/usg_heatCell/g) ?? []).length === 371, "heatmap renders 53 x 7 cells");
	const filled = history.querySelector(".usg_heatCell[data-tokens]");
	if (filled !== null) {
		await click(filled);
		assert(container.querySelector('[data-kind="day"]') !== null, "day detail must open from a heat cell");
	}
	assert(container.querySelector("[data-usage-stats-badge]") !== null, "badge must survive the full walk");

	// Boundary self-test: a throwing child must produce the inline fallback and
	// a [usg] console error, not an unmounted tree.
	const crashErrorsBefore = errors.length;
	const Boom = () => { throw new Error("boom-fixture"); };
	const crashContainer = document.createElement("div");
	document.body.appendChild(crashContainer);
	const crashRoot = createRoot(crashContainer);
	await act(async () => {
		crashRoot.render(react.createElement(PanelErrorBoundary, { translate: t, onClose: () => {}, children: react.createElement(Boom) }));
	});
	assert(crashContainer.querySelector("[data-usg-crash]") !== null, "error boundary must render the crash fallback");
	assert(errors.length > crashErrorsBefore, "error boundary must log the crash to the console");
	assert(errors.some((line) => line.includes("panel render crashed") && line.includes("boom-fixture")), "crash log must carry the [usg] prefix and the original message");
	errors.length = crashErrorsBefore; // keep the main assertion focused on the panel walk

	assert(errors.length === 0, `no console.error allowed during the panel walk, got:\n${errors.join("\n---\n")}`);
	console.log("CLIENT DOM TESTS PASSED (open panel, account flyout, history, day detail, error boundary)");
	process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });

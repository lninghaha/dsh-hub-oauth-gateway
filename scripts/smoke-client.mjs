// Smoke-test the hand-written client bundle outside the browser.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = process.env.SMOKE_NODE_MODULES === void 0
	? createRequire(import.meta.url)
	: createRequire(join(process.env.SMOKE_NODE_MODULES, "_anchor.js"));
const react = require("react");
const jsxRuntime = require("react/jsx-runtime");
const { renderToStaticMarkup } = require("react-dom/server");

const Stub = (props) => props?.children ?? null;
const primitives = new Proxy({}, { get: () => Stub });
let captured = null;
const listeners = new Map();
globalThis.window = {
	__ModuleLoader__: { load: (entry) => { captured = entry; } },
	setInterval: () => 1,
	clearInterval: () => {}
};
globalThis.document = {
	querySelector: () => null,
	createElement: () => ({ dataset: {}, appendChild: () => {} }),
	head: { appendChild: () => {} },
	addEventListener: (type, fn) => listeners.set(type, fn),
	removeEventListener: (type) => listeners.delete(type)
};

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "client.js"), "utf8");
if (!source.includes("/api/usage-stats/providers")) throw new Error("client must load provider summaries");
if (!source.includes("/api/usage-stats/account")) throw new Error("account flyout must retain the unified account endpoint");
if (source.includes('fetchJson("/api/usage-stats/subscriptions")')) throw new Error("client must not bulk-fetch the legacy subscriptions endpoint");
if (source.includes("#1f6feb") || source.includes("BLUE_RGB")) throw new Error("client must not hardcode the old blue palette");
if (!source.includes("--dsw-alias-state-business-primary")) throw new Error("client heatmap must use DSH semantic theme tokens");
if (source.includes("usg_providerSelect")) throw new Error("provider dropdown must be replaced by the account list");
new Function(source)();

if (captured === null) throw new Error("loader did not capture the bundle");
if (captured.id !== "dsh-usage-stats") throw new Error(`unexpected id ${captured.id}`);
const exports_ = captured.factory((spec) => {
	if (spec === "react") return react;
	if (spec === "react/jsx-runtime") return jsxRuntime;
	if (spec === "@deepseek-ai/dsh-client-ui-primitives") return primitives;
	throw new Error(`unexpected require: ${spec}`);
});
if (typeof exports_.apply !== "function") throw new Error("missing apply export");

const { UsageStatsPanel } = exports_;
const closedMarkup = renderToStaticMarkup(react.createElement(UsageStatsPanel, { wide: true, t: (key) => key }));
if (!closedMarkup.includes("用量/余额") && !closedMarkup.includes("panel.badge")) throw new Error("badge label missing from closed panel");
console.log("closed panel render ok, markup length:", closedMarkup.length);

const registrations = [];
const registrationOptions = [];
const ctx = {
	effect: () => {},
	locale: { register: (ns, dict) => { if (ns !== "usageStats") throw new Error(`unexpected ns ${ns}`); if (!dict.zh || !dict.en) throw new Error("missing dictionaries"); }, bind: () => () => "usageStats.settings.nav" },
	slots: { inject: (slot, fn) => { registrations.push([slot, fn]); return () => {}; }, register: (options) => { registrationOptions.push(options); return () => {}; } }
};
exports_.apply(ctx);
if (registrations.length !== 2) throw new Error(`expected two slot injections, got ${registrations.length}`);
const [footerSlot, footerRegisterFn] = registrations[0];
if (footerSlot !== "sidebar.footer.action") throw new Error(`unexpected first slot ${footerSlot}`);
if (typeof footerRegisterFn() !== "function") throw new Error("slot registration must return a disposer");
const [sectionSlot, sectionRegisterFn] = registrations[1];
if (sectionSlot !== "settings.section") throw new Error(`unexpected second slot ${sectionSlot}`);
if (typeof sectionRegisterFn() !== "function") throw new Error("settings section registration must return a disposer");
const sectionOptions = registrationOptions[1];
if (sectionOptions.id !== "usage-stats" || sectionOptions.order !== 80 || sectionOptions.name !== "settings.section") throw new Error("settings section registration options mismatch");
if (typeof sectionOptions.label !== "function" || sectionOptions.label() === "") throw new Error("settings section label must resolve to a non-empty string");
console.log("apply ok, slots:", footerSlot, "+", sectionSlot);

const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const fixedNow = new Date(2026, 7, 13, 12, 0, 0);
const dayMap = new Map([
	["2026-08-10", { tokens: 10, cacheHitRate: 50 }],
	["2026-08-11", { tokens: 20, cacheHitRate: 60 }],
	["2026-08-13", { tokens: 40, cacheHitRate: 70 }]
]);
const findCell = (heat, key) => heat.weeks.flat().find((cell) => cell.key === key);
const { ActivityHeatmap, buildActivityHeatmap, cellColor } = exports_;
const daily = buildActivityHeatmap(dayMap, "daily", fixedNow);
if (daily.weeks.length !== 53) throw new Error(`activity heatmap must have 53 weeks, got ${daily.weeks.length}`);
for (const week of daily.weeks) if (week.length !== 7) throw new Error("every activity week must have 7 days");
if (daily.weeks[0][0].date.getDay() !== 1) throw new Error("activity heatmap must begin on Monday");
if (daily.end !== localKey(fixedNow)) throw new Error(`activity heatmap must end at today, got ${daily.end}`);
if (findCell(daily, "2026-08-11").tokens !== 20) throw new Error("daily mode must use each day's tokens");
const weekly = buildActivityHeatmap(dayMap, "weekly", fixedNow);
for (const key of ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13"]) if (findCell(weekly, key).tokens !== 70) throw new Error(`weekly mode must repeat the week total for ${key}`);
const total = buildActivityHeatmap(dayMap, "total", fixedNow);
if (findCell(total, "2026-08-10").tokens !== 10 || findCell(total, "2026-08-11").tokens !== 30 || findCell(total, "2026-08-13").tokens !== 70) throw new Error("total mode must be a running total");
if (findCell(daily, "2026-08-14").future !== true || findCell(daily, "2026-08-14").tokens !== 0) throw new Error("future cells must stay empty");
const heatMarkup = renderToStaticMarkup(react.createElement(ActivityHeatmap, { heat: daily, translate: (key) => key, selectedKey: null, onSelect: () => {} }));
if ((heatMarkup.match(/usg_heatCell/g) ?? []).length !== 371) throw new Error("activity heatmap must render 53 × 7 cells");
if (!heatMarkup.includes("2026-08-13") || !heatMarkup.includes("tokens")) throw new Error("heatmap cells need date/token tooltips");
if (!heatMarkup.includes("usg_monthLabel")) throw new Error("activity heatmap needs month labels");
const strengthOf = (tokens, max) => {
	const background = cellColor(tokens, max).background;
	if (background === "var(--usg-cell-empty)") return 0;
	const match = background.match(/\s(\d+)%/);
	if (match === null) throw new Error(`unexpected token colour: ${background}`);
	return Number(match[1]);
};
const strengths = [10, 20, 40].map((tokens) => strengthOf(tokens, 40));
if (!(strengths[0] < strengths[1] && strengths[1] < strengths[2] && strengths[2] === 100)) throw new Error(`theme colour scale not monotonic: ${JSON.stringify(strengths)}`);
if (strengthOf(0, 40) !== 0) throw new Error("zero-token cells must use the semantic empty token");
console.log("53-week activity heatmap modes/theme scale ok");

const { AccountList, ProviderAccountCard, buildProviderChoices } = exports_;
const providers = buildProviderChoices([
	{ id: "deepseek-official", displayName: "DeepSeek", adapter: "deepseek-balance", accountMode: "balance", configured: true, status: "ok", balance: { remaining: 36.44, currency: "CNY" } },
	{ id: "opencode-go", displayName: "OpenCode Go", adapter: "opencode-go", accountMode: "subscription", configured: true, status: "ok", nextResetAt: "2026-08-14T01:00:00Z", windows: [
		{ kind: "session", usedPercent: 12, remainingPercent: 88, resetsAt: "2026-08-14T01:00:00Z" },
		{ kind: "weekly", usedPercent: 34, remainingPercent: 66 },
		{ kind: "monthly", usedPercent: 56, remainingPercent: 44 }
	] },
	{ id: "zai-coding-cn", displayName: "Z.ai CN", adapter: "zai-token-plan", accountMode: "subscription", configured: false, status: "not-configured", windows: [] }
]);
const listMarkup = renderToStaticMarkup(react.createElement(AccountList, { providers, selectedProvider: "opencode-go", density: "detailed", hiddenSet: new Set(), translate: (key) => key, onSelect: () => {} }));
for (const name of ["DeepSeek", "OpenCode Go", "Z.ai CN"]) if (!listMarkup.includes(name)) throw new Error(`account list missing ${name}`);
if ((listMarkup.match(/usg_providerRow/g) ?? []).length !== 3) throw new Error("account list must render one row per provider");
if (!listMarkup.includes("5h") || !listMarkup.includes("wk") || !listMarkup.includes("30d")) throw new Error("detailed rows need compact quota chips");
if (!listMarkup.includes("data-selected")) throw new Error("selected provider row must be highlighted");
if (listMarkup.includes("usg_visToggle")) throw new Error("popup account rows must not carry inline visibility toggles");

const translateAccount = (key, params) => params?.value !== void 0 ? `${key}:${params.value}` : params?.refs !== void 0 ? `${key}:${params.refs}` : params?.ref !== void 0 ? `${key}:${params.ref}` : key;
const deepseekMarkup = renderToStaticMarkup(react.createElement(ProviderAccountCard, {
	provider: providers[0], account: { id: "deepseek-official", displayName: "DeepSeek", mode: "balance", status: "ok", fetchedAt: Date.now(), balance: { remaining: 36.44, currency: "CNY", unlimited: false, breakdown: { toppedUp: 20, granted: 16.44 } } }, accountLoading: false, accountError: null, translate: translateAccount, onRetry: () => {}
}));
const goMarkup = renderToStaticMarkup(react.createElement(ProviderAccountCard, {
	provider: providers[1], account: { ...providers[1], mode: "subscription", fetchedAt: Date.now() }, accountLoading: false, accountError: null, translate: translateAccount, onRetry: () => {}
}));
if (!deepseekMarkup.includes("data-account-mode=\"balance\"") || !deepseekMarkup.includes("DeepSeek") || deepseekMarkup.includes("progressbar")) throw new Error("balance flyout must render only monetary data");
if (!goMarkup.includes("data-account-mode=\"subscription\"") || (goMarkup.match(/role=\"progressbar\"/g) ?? []).length !== 3 || !goMarkup.includes("width:12%")) throw new Error("subscription flyout must render its three quota meters");
const invalidMarkup = renderToStaticMarkup(react.createElement(ProviderAccountCard, { provider: { id: "minimax", displayName: "MiniMax", accountMode: "subscription", status: "invalid-response" }, account: { id: "minimax", displayName: "MiniMax", mode: "subscription", status: "invalid-response", windows: [] }, accountLoading: false, accountError: null, translate: translateAccount, onRetry: () => {} }));
if (!invalidMarkup.includes("account.status.invalidResponse") || !invalidMarkup.includes("account.invalidResponse")) throw new Error("invalid responses need a distinct status and explanation");
const notConfiguredMarkup = renderToStaticMarkup(react.createElement(ProviderAccountCard, { provider: providers[2], account: { id: "zai-coding-cn", displayName: "Z.ai CN", mode: "subscription", status: "not-configured", windows: [] }, accountLoading: false, accountError: null, translate: translateAccount, onRetry: () => {} }));
if (!notConfiguredMarkup.includes("account.configureHint")) throw new Error("not-configured flyout must point users to the settings section");
if (notConfiguredMarkup.includes("usg_credSection")) throw new Error("popup flyout must not embed the credential editor");
if (providers.find((provider) => provider.id === "zai-coding-cn")?.accountMode !== "subscription") throw new Error("Z.ai must keep its subscription presentation and real provider id");
console.log("multi-provider list and account flyouts render ok");

const { SettingsSectionContent, UsageStatsSettingsSection } = exports_;
const settingsMarkup = renderToStaticMarkup(react.createElement(SettingsSectionContent, {
	providers, hidden: new Set(["zai-coding-cn"]), density: "detailed", historyMode: "daily",
	debugOn: true, serverReady: true, translate: (key) => key,
	onToggleVisibility: () => {}, onChangeDensity: () => {}, onChangeHistoryMode: () => {}, onToggleDebug: () => {}
}));
if (!settingsMarkup.includes("usg_setSection")) throw new Error("settings section must render the section shell");
for (const label of ["settings.title", "settings.visibility", "settings.credentials", "settings.displayDefaults", "settings.debug"]) if (!settingsMarkup.includes(label)) throw new Error(`settings section missing group: ${label}`);
if (!settingsMarkup.includes("usg_switch")) throw new Error("settings section needs visibility/debug switches");
if (!settingsMarkup.includes("DeepSeek") || !settingsMarkup.includes("OpenCode Go")) throw new Error("settings section must list providers");
if (!settingsMarkup.includes("data-on")) throw new Error("settings section visibility switches must reflect hidden state");
const serverDownMarkup = renderToStaticMarkup(react.createElement(SettingsSectionContent, {
	providers: [], hidden: new Set(), density: "detailed", historyMode: "daily",
	debugOn: true, serverReady: false, translate: (key) => key,
	onToggleVisibility: () => {}, onChangeDensity: () => {}, onChangeHistoryMode: () => {}, onToggleDebug: () => {}
}));
if (!serverDownMarkup.includes("settings.serverRestartHint")) throw new Error("settings section must surface the server-restart hint");
console.log("settings section render ok");

const { DayDetail } = exports_;
const dayDetail = renderToStaticMarkup(react.createElement(DayDetail, {
	day: { date: "2026-08-13", tokens: 34333358, inputTokens: 199382, outputTokens: 116824, cacheReadTokens: 34017152, cacheWriteTokens: 0, cacheHitRate: 99.4, models: [
		{ model: "deepseek-official/deepseek-v4-flash", tokens: 30000000, inputTokens: 100000, outputTokens: 50000, cacheReadTokens: 29000000, cacheWriteTokens: 0, cacheHitRate: 99.6 },
		{ model: "ark/deepseek-v4-flash", tokens: 4333358, inputTokens: 99382, outputTokens: 66824, cacheReadTokens: 5017152, cacheWriteTokens: 0, cacheHitRate: 98.1 }
	] }, translate: (key) => key, onBack: () => {}
}));
if (!dayDetail.includes("deepseek-official · deepseek-v4-flash") || !dayDetail.includes("ark · deepseek-v4-flash")) throw new Error("day detail must keep provider-prefixed models distinct");

const { dismissAction, createLoader, fmtCurrency, resetRelativeLabel } = exports_;
if (dismissAction({ outside: true, flyout: "account" }) !== "panel") throw new Error("outside click must close the whole panel");
if (dismissAction({ escape: true, flyout: "history", selectedDay: "2026-08-13" }) !== "day") throw new Error("Escape must leave day detail first");
if (dismissAction({ escape: true, flyout: "account" }) !== "flyout") throw new Error("Escape must close a flyout before the panel");
if (dismissAction({ escape: true }) !== "panel") throw new Error("Escape must close the bare panel");
const usageLoader = createLoader();
const accountLoader = createLoader();
const usageId = usageLoader.start();
const accountId = accountLoader.start();
if (!usageLoader.isCurrent(usageId) || !accountLoader.isCurrent(accountId)) throw new Error("independent request loaders must not invalidate each other");
usageLoader.start();
if (usageLoader.isCurrent(usageId) || !accountLoader.isCurrent(accountId)) throw new Error("only a newer request of the same kind may supersede a loader");
const cny = fmtCurrency("36.44", "CNY");
if (!cny.includes("36.44") || fmtCurrency(void 0, "CNY") !== "—" || fmtCurrency("9.9", "USD").includes("¥")) throw new Error("currency formatting regression");
const reset = resetRelativeLabel("2026-08-13T14:16:00Z", (key, params) => `${key}:${params?.time ?? ""}`, Date.parse("2026-08-13T10:00:00Z"));
if (!reset.includes("4h 16m")) throw new Error(`relative reset label mismatch: ${reset}`);
console.log("dismiss layering, request races, currency, and reset labels ok");

// Verify liquid glass CSS is injected
const cssSource = String(exports_.__cssSource ?? "");
// The CSS is embedded in client.js as a string array; verify key rules exist in the source
const clientSource = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../lib/client.js", import.meta.url), "utf8"));
if (!clientSource.includes("backdrop-filter")) throw new Error("liquid glass CSS missing backdrop-filter");
if (!clientSource.includes("prefers-reduced-motion")) throw new Error("liquid glass CSS missing reduced-motion media query");
if (!clientSource.includes("usg_shimmer")) throw new Error("liquid glass CSS missing shimmer animation");
if (!clientSource.includes("usg_credSection")) throw new Error("credential UI CSS classes missing");
if (!clientSource.includes("usg_setSection")) throw new Error("settings section CSS classes missing");
if (clientSource.includes("usg_visToggle")) throw new Error("popup visibility-toggle CSS must be removed");
console.log("liquid glass CSS, credential UI, and settings section styles verified");

console.log("SMOKE TEST PASSED");

/**
 * dsh-usage-stats — browser half.
 *
 * Hand-written `__ModuleLoader__` bundle (no build step): a sidebar footer
 * action that opens a compact provider-account list, an optional detail
 * flyout, and a GitHub-style token activity heatmap. Every colour comes from
 * the DSH semantic token layer, so light/dark/system changes follow the shell.
 */
window.__ModuleLoader__.load({
	id: "dsh-usage-stats",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		//#region debug
		/** Debug logger — enabled by default during development; toggle via localStorage or URL param. */
		const DEBUG_KEY = "dsh-usage-stats-debug";
		function isDebugEnabled() {
			try {
				if (typeof location !== "undefined" && new URLSearchParams(location.search).has("usg-debug")) return true;
				if (typeof localStorage !== "undefined") return localStorage.getItem(DEBUG_KEY) === "1";
			} catch {}
			return true; // default on during dev cycle
		}
		let _debugEnabled = isDebugEnabled();
		function dbg(...args) {
			if (!_debugEnabled) return;
			console.log("[usg]", ...args);
		}
		function dbgWarn(...args) {
			if (!_debugEnabled) return;
			console.warn("[usg]", ...args);
		}
		function dbgError(...args) {
			// Errors always log regardless of toggle
			console.error("[usg]", ...args);
		}
		function setDebug(enabled) {
			_debugEnabled = enabled;
			try { if (typeof localStorage !== "undefined") localStorage.setItem(DEBUG_KEY, enabled ? "1" : "0"); } catch {}
			dbg("debug", enabled ? "enabled" : "disabled");
		}
		//#endregion

		//#region css
		const css = [
			".usg_layer{flex:none;align-items:center;width:100%;height:49px;margin:8px 0 0;display:flex;position:relative}",
			".usg_footerButtons{align-items:center;width:100%;display:flex}",
			".usg_badge{width:100%;height:49px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:none;border-radius:12px;align-items:center;gap:8px;padding:0 8px 0 6px;font-family:inherit;font-size:14px;display:inline-flex;overflow:hidden}",
			".usg_badge:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}",
			".usg_badge[data-active]{background:var(--dsw-alias-interactive-bg-active)}",
			".usg_badgeLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}",
			".usg_badgeCount{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;flex:none;margin-left:auto;font-size:12px;line-height:16px}",
			".usg_layer.usg_rail{width:36px;height:36px;margin:0}",
			".usg_layer.usg_rail .usg_badge{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;padding:0}",
			".usg_layer.usg_rail .usg_footerButtons{flex-direction:column;gap:2px}",
			".usg_surface{z-index:40;max-width:calc(100vw - 24px);align-items:flex-end;gap:8px;display:flex;position:fixed;bottom:112px;left:12px}",
			".usg_panel,.usg_flyout{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-3));box-shadow:var(--dsw-shadow-lv2);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);--usg-cell-empty:var(--dsw-alias-interactive-bg-hover);border-radius:14px;flex-direction:column;display:flex;overflow:hidden}",
			".usg_panel{width:340px;max-width:calc(100vw - 24px);max-height:74vh}",
			".usg_flyout{width:370px;max-width:calc(100vw - 24px);max-height:74vh}",
			".usg_flyout[data-kind=history],.usg_flyout[data-kind=day]{width:min(680px,calc(100vw - 382px))}",
			".usg_header{box-sizing:border-box;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-3));flex:none;justify-content:space-between;align-items:center;min-height:48px;padding:10px 12px 9px;display:flex}",
			".usg_headerLeft{min-width:0;align-items:center;gap:8px;display:flex}",
			".usg_headerIdentity{min-width:0;flex-direction:column;display:flex}",
			".usg_title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:20px}",
			".usg_subtitle{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:16px;overflow:hidden}",
			".usg_headerActions{align-items:center;gap:2px;display:flex}",
			".usg_headerMeta{color:var(--dsw-alias-label-tertiary);white-space:nowrap;margin-right:2px;font-size:11px;line-height:20px}",
			".usg_iconButton{cursor:pointer;width:28px;height:28px;color:var(--dsw-alias-label-tertiary);background:0 0;border:none;border-radius:7px;justify-content:center;align-items:center;padding:0;display:inline-flex}",
			".usg_iconButton:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}",
			".usg_body{flex:1;min-height:0;overflow-y:auto}",
			".usg_flyoutBody{flex:1;min-height:0;padding:14px;overflow:auto}",
			".usg_density{box-sizing:border-box;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:9px;grid-template-columns:1fr 1fr;gap:2px;margin:9px 12px 8px;padding:2px;display:grid}",
			".usg_segmentButton{color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:7px;padding:5px 10px;font:inherit;font-size:12px;line-height:18px}",
			".usg_segmentButton:hover{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}",
			".usg_segmentButton[data-active]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-active);font-weight:600}",
			".usg_providerList{flex-direction:column;display:flex}",
			".usg_providerRow{box-sizing:border-box;width:100%;color:inherit;cursor:pointer;background:0 0;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);align-items:center;gap:10px;padding:11px 12px;font:inherit;text-align:left;display:flex}",
			".usg_providerRow:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".usg_providerRow[data-selected]{background:var(--dsw-alias-interactive-bg-active)}",
			".usg_providerRow[data-density=compact]{padding-top:9px;padding-bottom:9px}",
			".usg_providerMark{width:27px;height:27px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-module-platform);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;justify-content:center;align-items:center;font-size:9px;font-weight:700;display:flex;flex:none}",
			".usg_providerMain{min-width:0;flex:1;flex-direction:column;gap:5px;display:flex}",
			".usg_providerTop{min-width:0;align-items:baseline;gap:8px;display:flex}",
			".usg_providerName{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:13px;font-weight:600;line-height:18px;overflow:hidden}",
			".usg_providerSummary{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;margin-left:auto;font-size:10px;line-height:16px;overflow:hidden}",
			".usg_providerArrow{color:var(--dsw-alias-label-tertiary);flex:none}",
			".usg_chipRow{flex-wrap:wrap;align-items:center;gap:7px 10px;display:flex}",
			".usg_windowChip{color:var(--dsw-alias-label-secondary);align-items:center;gap:4px;font-size:10px;line-height:14px;display:inline-flex}",
			".usg_chipLabel{color:var(--dsw-alias-label-tertiary);min-width:18px}",
			".usg_chipTrack{width:38px;height:6px;background:var(--dsw-alias-interactive-bg-hover);border-radius:999px;overflow:hidden}",
			".usg_chipFill{height:100%;background:var(--dsw-alias-state-business-primary);border-radius:inherit}",
			".usg_chipValue{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;font-weight:600}",
			".usg_balanceChip{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}",
			".usg_panelFooter{border-top:1px solid var(--dsw-alias-border-l1);padding:4px 0;display:flex}",
			".usg_footerAction{width:100%;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:0;justify-content:space-between;align-items:center;padding:10px 14px;font:inherit;font-size:12px;font-weight:600;line-height:18px;display:flex}",
			".usg_footerAction:hover,.usg_footerAction[data-active]{background:var(--dsw-alias-interactive-bg-hover)}",
			".usg_note{color:var(--dsw-alias-label-tertiary);margin:10px 12px;font-size:12px;line-height:18px}",
			".usg_error{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-radius:8px;justify-content:space-between;align-items:flex-start;gap:8px;margin:0;padding:8px 9px;font-size:12px;line-height:18px;display:flex}",
			".usg_retry{color:inherit;font:inherit;cursor:pointer;background:0 0;border:none;flex:none;padding:0}",
			".usg_accountPane{flex-direction:column;gap:14px;display:flex}",
			".usg_accountHead{align-items:center;gap:9px;display:flex}",
			".usg_accountMark{width:28px;height:28px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-module-platform);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;justify-content:center;align-items:center;font-size:9px;font-weight:700;display:flex;flex:none}",
			".usg_accountIdentity{min-width:0;flex:1;flex-direction:column;display:flex}",
			".usg_accountName{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600;line-height:20px;overflow:hidden}",
			".usg_accountPlan{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:16px;overflow:hidden}",
			".usg_accountStatus{color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-interactive-bg-hover);border-radius:999px;padding:2px 7px;font-size:10px;line-height:16px;white-space:nowrap}",
			".usg_accountStatus[data-status=ok]{color:var(--dsw-alias-state-success-primary)}",
			".usg_accountStatus[data-status=unauthorized],.usg_accountStatus[data-status=invalid-response]{color:var(--dsw-alias-state-error-primary)}",
			".usg_accountStatus[data-status=rate-limited],.usg_accountStatus[data-status=not-configured]{color:var(--dsw-alias-state-warn-primary)}",
			".usg_quotaList{flex-direction:column;gap:16px;display:flex}",
			".usg_quotaRow{flex-direction:column;gap:6px;display:flex}",
			".usg_quotaTitle{color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600;line-height:18px}",
			".usg_quotaTrack{height:8px;background:var(--dsw-alias-interactive-bg-hover);border-radius:999px;overflow:hidden}",
			".usg_quotaFill{height:100%;background:var(--dsw-alias-state-business-primary);border-radius:inherit;min-width:2px;transition:width .2s ease}",
			".usg_quotaMeta{color:var(--dsw-alias-label-tertiary);justify-content:space-between;gap:8px;font-size:11px;line-height:16px;display:flex}",
			".usg_quotaUsed{font-variant-numeric:tabular-nums}",
			".usg_quotaReset{text-align:right}",
			".usg_quotaEmpty{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}",
			".usg_balanceMain{align-items:baseline;gap:8px;display:flex}",
			".usg_balanceAmount{color:var(--dsw-alias-label-primary);font-size:26px;font-weight:600;line-height:34px;font-variant-numeric:tabular-nums}",
			".usg_balanceCaption{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}",
			".usg_balanceRows{border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);flex-direction:column;padding-top:7px;font-size:12px;line-height:20px;display:flex}",
			".usg_balanceRow{justify-content:space-between;gap:12px;display:flex}",
			".usg_historyHead{justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;display:flex}",
			".usg_historyTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:20px}",
			".usg_historyModes{background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:2px;display:flex}",
			".usg_historyModes .usg_segmentButton{padding:3px 8px;font-size:11px;line-height:18px}",
			".usg_statsInline{color:var(--dsw-alias-label-tertiary);flex-wrap:wrap;gap:5px 12px;margin-bottom:10px;font-size:11px;line-height:16px;display:flex}",
			".usg_statsInline b{color:var(--dsw-alias-label-secondary);font-weight:600}",
			".usg_heatScroll{padding-bottom:4px;overflow-x:auto}",
			".usg_heatCanvas{width:max-content;min-width:100%}",
			".usg_monthLabels{height:18px;display:grid;column-gap:3px}",
			".usg_monthLabel{color:var(--dsw-alias-label-tertiary);white-space:nowrap;font-size:10px;line-height:16px}",
			".usg_heatGrid{display:grid;gap:3px}",
			".usg_heatCell{box-sizing:border-box;width:10px;height:10px;cursor:pointer;background:var(--usg-cell-empty);border:0;border-radius:3px;padding:0}",
			".usg_heatCell:hover:not(:disabled){box-shadow:0 0 0 1px var(--dsw-alias-label-secondary)}",
			".usg_heatCell:disabled{cursor:default;opacity:.55}",
			".usg_heatCell[data-selected]{box-shadow:0 0 0 2px var(--dsw-alias-label-primary)}",
			".usg_heatLegend{color:var(--dsw-alias-label-tertiary);justify-content:flex-end;align-items:center;gap:4px;margin-top:8px;font-size:10px;line-height:14px;display:flex}",
			".usg_legendSwatch{width:10px;height:10px;border-radius:3px;background:var(--usg-cell-empty)}",
			".usg_detailHeader{align-items:center;gap:8px;display:flex}",
			".usg_back{cursor:pointer;width:28px;height:28px;color:var(--dsw-alias-label-secondary);background:0 0;border:none;border-radius:7px;justify-content:center;align-items:center;padding:0;display:inline-flex;flex:none}",
			".usg_back:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}",
			".usg_detailDate{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:20px}",
			".usg_detailHit{color:var(--dsw-alias-label-tertiary);margin-left:auto;font-size:11px;line-height:20px;font-variant-numeric:tabular-nums}",
			".usg_detailSummary{color:var(--dsw-alias-label-secondary);margin:8px 0 10px;font-size:12px;line-height:18px;font-variant-numeric:tabular-nums}",
			".usg_modelList{flex-direction:column;gap:8px;display:flex}",
			".usg_modelRow{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:8px 10px;flex-direction:column;gap:5px;display:flex}",
			".usg_modelHead{align-items:center;gap:8px;display:flex}",
			".usg_modelName{color:var(--dsw-alias-label-primary);min-width:0;text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:12px;font-weight:500;line-height:18px;overflow:hidden}",
			".usg_modelTokens{color:var(--dsw-alias-label-primary);flex:none;font-size:12px;line-height:18px;font-variant-numeric:tabular-nums}",
			".usg_modelHit{color:var(--dsw-alias-label-tertiary);flex:none;width:56px;font-size:11px;line-height:18px;font-variant-numeric:tabular-nums;text-align:right}",
			".usg_modelBarTrack{background:var(--dsw-alias-interactive-bg-hover);border-radius:999px;height:5px;overflow:hidden}",
			".usg_modelBar{background:var(--dsw-alias-state-business-primary);border-radius:inherit;height:5px}",
			".usg_modelMeta{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums}",
			".usg_footerNote{color:var(--dsw-alias-label-caption);margin:10px 0 0;font-size:10px;line-height:16px;font-variant-numeric:tabular-nums}",
			"@media(max-width:760px){.usg_surface{max-height:calc(100vh - 124px);align-items:stretch;flex-direction:column-reverse;overflow:auto}.usg_panel,.usg_flyout,.usg_flyout[data-kind=history],.usg_flyout[data-kind=day]{width:min(340px,calc(100vw - 24px));max-height:48vh}.usg_heatCell{width:9px;height:9px}.usg_heatGrid{gap:2px}.usg_monthLabels{column-gap:2px}}",
			/* Liquid glass aesthetics */
			".usg_panel,.usg_flyout{background:color-mix(in srgb,var(--dsw-specific-menu,var(--dsw-alias-bg-layer-3)) 72%,transparent);backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4);border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2) 60%,transparent);box-shadow:0 8px 32px color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent),inset 0 1px 0 color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)}",
			".usg_header{position:relative}",
			".usg_header::before{content:'';position:absolute;inset:0 0 auto 0;height:1px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--dsw-alias-label-primary) 18%,transparent),transparent);pointer-events:none}",
			".usg_quotaFill,.usg_chipFill{background:linear-gradient(90deg,var(--dsw-alias-state-business-primary),color-mix(in srgb,var(--dsw-alias-state-business-primary) 80%,white));position:relative;overflow:hidden}",
			".usg_quotaFill::after{content:'';position:absolute;inset:0;background:linear-gradient(120deg,transparent 30%,color-mix(in srgb,white 35%,transparent) 50%,transparent 70%);animation:usg_shimmer 2.4s ease-in-out infinite}",
			"@keyframes usg_shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}",
			".usg_badge:hover{background:color-mix(in srgb,var(--dsw-alias-interactive-bg-hover-solid) 85%,transparent);backdrop-filter:blur(6px);transition:background .18s ease,backdrop-filter .18s ease}",
			".usg_surface[data-open]{animation:usg_fadeIn .18s ease-out}",
			"@keyframes usg_fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}",
			"@media(prefers-reduced-motion:reduce){.usg_quotaFill::after{animation:none}.usg_badge:hover,.usg_quotaFill{transition:none}.usg_surface[data-open]{animation:none}}",
			/* Credential UI */
			".usg_credSection{border-top:1px solid var(--dsw-alias-border-l1);padding-top:12px;margin-top:4px;flex-direction:column;gap:8px;display:flex}",
			".usg_credHead{align-items:center;gap:6px;display:flex}",
			".usg_credLabel{color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600;line-height:16px}",
			".usg_credStatus{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:14px;margin-left:auto}",
			".usg_credActions{flex-wrap:wrap;gap:6px;display:flex}",
			".usg_credBtn{cursor:pointer;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:5px 10px;font:inherit;font-size:11px;line-height:16px;display:inline-flex;align-items:center;gap:4px}",
			".usg_credBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-active)}",
			".usg_credBtn[data-danger]:hover{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-interactive-bg-hover-danger)}",
			".usg_credModal{flex-direction:column;gap:10px;display:flex}",
			".usg_credInput{width:100%;box-sizing:border-box;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px;font:inherit;font-size:13px;line-height:20px;outline:none}",
			".usg_credInput:focus{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 25%,transparent)}",
			".usg_credHint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}",
			".usg_oauthBox{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover);border-radius:8px;padding:10px 12px;flex-direction:column;gap:6px;font-size:12px;line-height:18px;display:flex}",
			".usg_oauthCode{color:var(--dsw-alias-label-primary);font-family:monospace;font-size:16px;font-weight:700;letter-spacing:2px;text-align:center;padding:8px 0}",
			".usg_oauthLink{color:var(--dsw-alias-state-business-primary);text-decoration:none;font-size:11px}",
			".usg_oauthLink:hover{text-decoration:underline}",
			/* Visibility toggle */
			/* Settings section */
			".usg_setSection{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}",
			".usg_setTitle{margin:0;font-size:18px;font-weight:600}",
			".usg_setIntro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:20px}",
			".usg_setGroup{flex-direction:column;gap:10px;display:flex}",
			".usg_setGroup+.usg_setGroup{margin-top:20px}",
			".usg_setGroupHead{letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;font-weight:600}",
			".usg_setCard{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:10px;padding:12px 14px;display:flex}",
			".usg_setName{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:20px}",
			".usg_setRef{color:var(--dsw-alias-label-tertiary);font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:10px;line-height:14px}",
			".usg_setActions{flex-wrap:wrap;gap:6px;display:flex}",
			".usg_manageList{flex-direction:column;gap:4px;display:flex}",
			".usg_manageRow{align-items:center;gap:8px;padding:6px 8px;border-radius:8px;display:flex}",
			".usg_manageRow:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".usg_manageName{color:var(--dsw-alias-label-primary);flex:1;min-width:0;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;overflow:hidden}",
			".usg_switch{position:relative;width:36px;height:20px;cursor:pointer;background:var(--dsw-alias-interactive-bg-hover);border:none;border-radius:999px;padding:0;flex:none;transition:background .15s ease}",
			".usg_switch::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;background:var(--dsw-alias-label-primary);border-radius:50%;transition:transform .15s ease}",
			".usg_switch[data-on]{background:var(--dsw-alias-state-business-primary)}",
			".usg_switch[data-on]::after{transform:translateX(16px)}"
		].join("");
		const tagId = "dsh-usage-stats/UsageStats.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-usage-stats";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		const S = {
			layer: "usg_layer", rail: "usg_rail", footerButtons: "usg_footerButtons", badge: "usg_badge", badgeLabel: "usg_badgeLabel", badgeCount: "usg_badgeCount",
			surface: "usg_surface", panel: "usg_panel", flyout: "usg_flyout", header: "usg_header", headerLeft: "usg_headerLeft", headerIdentity: "usg_headerIdentity", title: "usg_title", subtitle: "usg_subtitle", headerActions: "usg_headerActions", headerMeta: "usg_headerMeta", iconButton: "usg_iconButton", body: "usg_body", flyoutBody: "usg_flyoutBody",
			density: "usg_density", segmentButton: "usg_segmentButton", providerList: "usg_providerList", providerRow: "usg_providerRow", providerMark: "usg_providerMark", providerMain: "usg_providerMain", providerTop: "usg_providerTop", providerName: "usg_providerName", providerSummary: "usg_providerSummary", providerArrow: "usg_providerArrow", chipRow: "usg_chipRow", windowChip: "usg_windowChip", chipLabel: "usg_chipLabel", chipTrack: "usg_chipTrack", chipFill: "usg_chipFill", chipValue: "usg_chipValue", balanceChip: "usg_balanceChip", panelFooter: "usg_panelFooter", footerAction: "usg_footerAction",
			note: "usg_note", error: "usg_error", retry: "usg_retry", accountPane: "usg_accountPane", accountHead: "usg_accountHead", accountMark: "usg_accountMark", accountIdentity: "usg_accountIdentity", accountName: "usg_accountName", accountPlan: "usg_accountPlan", accountStatus: "usg_accountStatus", quotaList: "usg_quotaList", quotaRow: "usg_quotaRow", quotaTitle: "usg_quotaTitle", quotaTrack: "usg_quotaTrack", quotaFill: "usg_quotaFill", quotaMeta: "usg_quotaMeta", quotaUsed: "usg_quotaUsed", quotaReset: "usg_quotaReset", quotaEmpty: "usg_quotaEmpty", balanceMain: "usg_balanceMain", balanceAmount: "usg_balanceAmount", balanceCaption: "usg_balanceCaption", balanceRows: "usg_balanceRows", balanceRow: "usg_balanceRow",
			historyHead: "usg_historyHead", historyTitle: "usg_historyTitle", historyModes: "usg_historyModes", statsInline: "usg_statsInline", heatScroll: "usg_heatScroll", heatCanvas: "usg_heatCanvas", monthLabels: "usg_monthLabels", monthLabel: "usg_monthLabel", heatGrid: "usg_heatGrid", heatCell: "usg_heatCell", heatLegend: "usg_heatLegend", legendSwatch: "usg_legendSwatch",
			detailHeader: "usg_detailHeader", back: "usg_back", detailDate: "usg_detailDate", detailHit: "usg_detailHit", detailSummary: "usg_detailSummary", modelList: "usg_modelList", modelRow: "usg_modelRow", modelHead: "usg_modelHead", modelName: "usg_modelName", modelTokens: "usg_modelTokens", modelHit: "usg_modelHit", modelBarTrack: "usg_modelBarTrack", modelBar: "usg_modelBar", modelMeta: "usg_modelMeta", footerNote: "usg_footerNote",
			credSection: "usg_credSection", credHead: "usg_credHead", credLabel: "usg_credLabel", credStatus: "usg_credStatus", credActions: "usg_credActions", credBtn: "usg_credBtn", credModal: "usg_credModal", credInput: "usg_credInput", credHint: "usg_credHint", oauthBox: "usg_oauthBox", oauthCode: "usg_oauthCode", oauthLink: "usg_oauthLink",
			setSection: "usg_setSection", setTitle: "usg_setTitle", setIntro: "usg_setIntro", setGroup: "usg_setGroup", setGroupHead: "usg_setGroupHead", setCard: "usg_setCard", setName: "usg_setName", setRef: "usg_setRef", setActions: "usg_setActions",
			manageList: "usg_manageList", manageRow: "usg_manageRow", manageName: "usg_manageName", switch: "usg_switch"
		};
		//#endregion

		//#region helpers
		function dayKeyOf(date) {
			const month = String(date.getMonth() + 1).padStart(2, "0");
			const day = String(date.getDate()).padStart(2, "0");
			return `${date.getFullYear()}-${month}-${day}`;
		}

		function todayKey() {
			return dayKeyOf(new Date());
		}

		function startOfLocalWeek(date) {
			const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
			result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
			return result;
		}

		function addLocalDays(date, amount) {
			const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
			result.setDate(result.getDate() + amount);
			return result;
		}

		function fmt(n) {
			return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		}

		function fmtCompact(n) {
			const value = Number(n) || 0;
			if (value < 1000) return String(Math.round(value));
			if (value < 1000000) return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}k`;
			if (value < 1000000000) return `${(value / 1000000).toFixed(value < 10000000 ? 1 : 0)}m`;
			return `${(value / 1000000000).toFixed(1)}b`;
		}

		function fmtHit(hitRate) {
			return hitRate === null || hitRate === void 0 ? "—" : `${hitRate}%`;
		}

		function fmtCurrency(amount, currency) {
			if (amount === void 0 || amount === null) return "—";
			const numeric = Number(amount);
			if (!Number.isFinite(numeric)) return "—";
			try {
				return new Intl.NumberFormat(undefined, { style: "currency", currency: currency ?? "CNY" }).format(numeric);
			} catch {
				return `${currency ?? "CNY"} ${amount}`;
			}
		}

		function interpolate(template, params) {
			if (params === void 0) return template;
			return template.replace(/\{(\w+)\}/g, (match, key) => (Object.hasOwn(params, key) ? String(params[key]) : match));
		}

		function createLoader() {
			let current = 0;
			return { start: () => ++current, isCurrent: (id) => id === current };
		}

		/** Decide the layered dismiss target for outside clicks and Escape. */
		function dismissAction({ outside = false, escape = false, flyout = null, selectedDay = null } = {}) {
			if (outside) return "panel";
			if (!escape) return null;
			if (selectedDay !== null) return "day";
			if (flyout !== null) return "flyout";
			return "panel";
		}

		async function fetchJson(path) {
			const response = await fetch(path, { headers: { accept: "application/json" } });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const payload = await response.json();
			if (payload === null || typeof payload !== "object") throw new Error("unexpected response");
			return payload;
		}

		function buildProviderChoices(providers) {
			return Array.isArray(providers) ? providers.map((provider) => ({
				...provider,
				accountMode: provider.accountMode ?? "balance",
				windows: Array.isArray(provider.windows) ? provider.windows : []
			})) : [];
		}

		function providerViewAccount(provider) {
			if (provider === null || provider === void 0 || provider.status === "pending") return null;
			return {
				id: provider.id, displayName: provider.displayName, mode: provider.accountMode ?? "balance", adapter: provider.adapter,
				status: provider.status, fetchedAt: provider.fetchedAt, plan: provider.plan, windows: Array.isArray(provider.windows) ? provider.windows : [],
				balance: provider.balance ?? null, alert: provider.alert ?? null, stale: provider.stale === true, missingCredentials: provider.missingCredentials
			};
		}

		function durationText(milliseconds) {
			const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60000));
			const days = Math.floor(totalMinutes / 1440);
			const hours = Math.floor(totalMinutes % 1440 / 60);
			const minutes = totalMinutes % 60;
			const pieces = [];
			if (days > 0) pieces.push(`${days}d`);
			if (hours > 0 && pieces.length < 2) pieces.push(`${hours}h`);
			if (minutes > 0 && pieces.length < 2) pieces.push(`${minutes}m`);
			return pieces.length > 0 ? pieces.join(" ") : "<1m";
		}

		function resetRelativeLabel(value, translate, now = Date.now()) {
			if (typeof value !== "string") return "";
			const time = Date.parse(value);
			if (!Number.isFinite(time)) return "";
			if (time <= now) return translate("subscription.resetDue");
			return translate("subscription.resetsIn", { time: durationText(time - now) });
		}

		function updatedRelativeLabel(value, translate, now = Date.now()) {
			const time = typeof value === "number" ? value : Date.parse(value);
			if (!Number.isFinite(time)) return translate("panel.updatedUnknown");
			const delta = Math.max(0, now - time);
			if (delta < 60000) return translate("panel.updatedJustNow");
			return translate("panel.updatedAgo", { time: durationText(delta) });
		}

		function providerMark(provider) {
			const known = { "deepseek-official": "DS", deepseek: "DS", "opencode-go": "GO", openrouter: "OR", moonshotai: "K", "moonshotai-cn": "K", kimi: "K", "kimi-coding": "K", "kimi-for-coding": "K", zai: "Z", "zai-coding-cn": "Z", minimax: "M", minimaxi: "M", claude: "CL", "claude-code": "CL", codex: "CX", "openai-codex": "CX", gemini: "GE", "gemini-cli": "GE", copilot: "CP", "github-copilot": "CP", cursor: "CU", grok: "GK", "xai-grok": "GK", amp: "AM", ampcode: "AM", dashscope: "DQ", bailian: "DQ", siliconflow: "SF", "silicon-flow": "SF" };
			return known[provider.id] ?? String(provider.displayName ?? provider.id).replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();
		}

		function windowShortLabel(kind) {
			if (kind === "session") return "5h";
			if (kind === "daily") return "1d";
			if (kind === "weekly") return "wk";
			if (kind === "monthly") return "30d";
			if (kind === "billing") return "MCP";
			if (kind === "quota") return "all";
			return String(kind ?? "").slice(0, 4);
		}

		function quotaLabel(kind, translate) {
			if (kind === "session") return translate("subscription.window.session");
			if (kind === "daily") return translate("subscription.window.daily");
			if (kind === "weekly") return translate("subscription.window.weekly");
			if (kind === "monthly") return translate("subscription.window.monthly");
			if (kind === "quota") return translate("subscription.window.quota");
			if (kind === "billing") return translate("subscription.window.mcp");
			return kind;
		}

		function subscriptionStatusLabel(status, translate) {
			if (status === "ok") return translate("subscription.status.ok");
			if (status === "pending" || status === "loading") return translate("account.status.loading");
			if (status === "not-configured") return translate("subscription.status.notConfigured");
			if (status === "unauthorized") return translate("subscription.status.unauthorized");
			if (status === "rate-limited") return translate("subscription.status.rateLimited");
			if (status === "invalid-response") return translate("account.status.invalidResponse");
			if (status === "unsupported") return translate("account.status.unsupported");
			return translate("subscription.status.unavailable");
		}

		function modelLabelOf(key, translate) {
			if (typeof key !== "string") return "";
			const slash = key.indexOf("/");
			if (slash === -1) return key;
			const provider = key.slice(0, slash);
			const model = key.slice(slash + 1);
			const providerLabel = provider === "unknown" ? translate("usage.unknownModel") : provider;
			const modelLabel = model === "unknown" || model === "" ? translate("usage.unknownModel") : model;
			return `${providerLabel} · ${modelLabel}`;
		}

		function dayLabel(key, translate) {
			const [year, month, day] = key.split("-").map(Number);
			const date = new Date(year, month - 1, day);
			const weekdays = [translate("weekday.sun"), translate("weekday.mon"), translate("weekday.tue"), translate("weekday.wed"), translate("weekday.thu"), translate("weekday.fri"), translate("weekday.sat")];
			return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${weekdays[date.getDay()]}`;
		}

		function monthName(month, translate) {
			const names = translate("month.names").split(",");
			return names[month] ?? String(month + 1);
		}

		function cellColor(tokens, max) {
			if (tokens <= 0) return { background: "var(--usg-cell-empty)" };
			const ratio = max > 0 ? Math.sqrt(tokens / max) : 1;
			const strength = Math.round(34 + 66 * Math.min(1, ratio));
			return { background: `color-mix(in srgb, var(--dsw-alias-state-business-primary) ${strength}%, var(--usg-cell-empty))` };
		}

		function buildActivityHeatmap(dayMap, mode = "daily", now = new Date()) {
			const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			const endWeekStart = startOfLocalWeek(today);
			const start = addLocalDays(endWeekStart, -52 * 7);
			const todayString = dayKeyOf(today);
			const weeks = [];
			let cumulative = 0;
			let max = 0;
			for (let weekIndex = 0; weekIndex < 53; weekIndex += 1) {
				const raw = [];
				for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
					const date = addLocalDays(start, weekIndex * 7 + dayIndex);
					const key = dayKeyOf(date);
					const future = key > todayString;
					const entry = future ? null : dayMap.get(key) ?? null;
					raw.push({ date, key, future, rawTokens: entry?.tokens ?? 0, hitRate: entry?.cacheHitRate ?? null });
				}
				const weeklyTokens = raw.reduce((sum, cell) => sum + cell.rawTokens, 0);
				const week = raw.map((cell) => {
					if (!cell.future) cumulative += cell.rawTokens;
					const value = mode === "weekly" ? weeklyTokens : mode === "total" ? cumulative : cell.rawTokens;
					if (!cell.future && value > max) max = value;
					return { ...cell, tokens: cell.future ? 0 : value };
				});
				weeks.push(week);
			}
			const monthLabels = [{ weekIndex: 0, month: start.getMonth(), year: start.getFullYear() }];
			for (let weekIndex = 0; weekIndex < weeks.length; weekIndex += 1) {
				const firstOfMonth = weeks[weekIndex].find((cell) => cell.date.getDate() === 1);
				if (firstOfMonth === void 0 || weekIndex === 0) continue;
				monthLabels.push({ weekIndex, month: firstOfMonth.date.getMonth(), year: firstOfMonth.date.getFullYear() });
			}
			return { weeks, max, monthLabels, start: dayKeyOf(start), end: todayString, mode };
		}
		//#endregion

		//#region account components
		function providerSummary(provider, translate) {
			if (provider.accountMode === "subscription" && provider.nextResetAt) return resetRelativeLabel(provider.nextResetAt, translate);
			if (provider.accountMode === "balance" && provider.balance !== null && provider.balance !== void 0) return fmtCurrency(provider.balance.remaining, provider.balance.currency);
			return subscriptionStatusLabel(provider.status, translate);
		}

		function AccountRowChips({ provider }) {
			if (provider.accountMode === "subscription" && provider.windows.length > 0) return react_jsx_runtime.jsx("div", { className: S.chipRow, children: provider.windows.slice(0, 3).map((window) => {
				const used = Math.max(0, Math.min(100, Number(window.usedPercent) || 0));
				return react_jsx_runtime.jsxs("span", { className: S.windowChip, children: [
					react_jsx_runtime.jsx("span", { className: S.chipLabel, children: windowShortLabel(window.kind) }),
					react_jsx_runtime.jsx("span", { className: S.chipTrack, children: react_jsx_runtime.jsx("span", { className: S.chipFill, style: { width: `${used}%` } }) }),
					react_jsx_runtime.jsx("span", { className: S.chipValue, children: `${used.toFixed(used % 1 === 0 ? 0 : 1)}%` })
				] }, window.kind);
			}) });
			if (provider.accountMode === "balance" && provider.balance !== null && provider.balance !== void 0) return react_jsx_runtime.jsx("div", { className: S.balanceChip, children: fmtCurrency(provider.balance.remaining, provider.balance.currency) });
			return null;
		}

		function AccountList({ providers, selectedProvider, density, hiddenSet, translate, onSelect }) {
			const visible = providers.filter((p) => !hiddenSet.has(p.id));
			if (visible.length === 0 && providers.length > 0) return react_jsx_runtime.jsx("p", { className: S.note, children: translate("prefs.allHidden") });
			if (visible.length === 0) return react_jsx_runtime.jsx("p", { className: S.note, children: translate("account.loading") });
			return react_jsx_runtime.jsx("div", { className: S.providerList, children: visible.map((provider) => react_jsx_runtime.jsxs("button", {
				type: "button", className: S.providerRow, "data-density": density, ...(selectedProvider === provider.id ? { "data-selected": true } : {}), onClick: () => onSelect(provider.id), children: [
					react_jsx_runtime.jsx("span", { className: S.providerMark, "aria-hidden": true, children: providerMark(provider) }),
					react_jsx_runtime.jsxs("span", { className: S.providerMain, children: [
						react_jsx_runtime.jsxs("span", { className: S.providerTop, children: [
							react_jsx_runtime.jsx("span", { className: S.providerName, children: provider.displayName }),
							react_jsx_runtime.jsx("span", { className: S.providerSummary, children: providerSummary(provider, translate) })
						] }),
						density === "detailed" ? react_jsx_runtime.jsx(AccountRowChips, { provider }) : null
					] }),
					react_jsx_runtime.jsx("span", { className: S.providerArrow, children: react_jsx_runtime.jsx(primitives.IconChevronRightOutline14, { size: 13 }) })
				]
			}, provider.id)) });
		}

		function BalanceContent({ balance, state, message, translate, onRetry }) {
			if (state === "loading" || balance === null && state === "ok") return react_jsx_runtime.jsx("p", { className: S.quotaEmpty, children: translate("balance.loading") });
			if (state === "unsupported") return react_jsx_runtime.jsx("p", { className: S.quotaEmpty, children: translate("balance.unsupported") });
			if (state === "no-credential") return react_jsx_runtime.jsx("p", { className: S.quotaEmpty, children: translate("balance.noCredential", { ref: message ?? "" }) });
			if (state === "error") return react_jsx_runtime.jsxs("div", { className: S.error, children: [react_jsx_runtime.jsx("span", { children: translate("balance.error", { message: message ?? "" }) }), react_jsx_runtime.jsx("button", { type: "button", className: S.retry, onClick: onRetry, children: translate("action.retry") })] });
			return react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, { children: [
				react_jsx_runtime.jsxs("div", { className: S.balanceMain, children: [react_jsx_runtime.jsx("span", { className: S.balanceAmount, children: balance.unlimited ? "∞" : fmtCurrency(balance.remaining, balance.currency) }), react_jsx_runtime.jsx("span", { className: S.balanceCaption, children: translate("balance.remaining") })] }),
				react_jsx_runtime.jsx("div", { className: S.balanceRows, children: [
					{ value: balance.used, label: translate("balance.used") }, { value: balance.total, label: translate("balance.total") }, { value: balance.breakdown?.toppedUp, label: translate("balance.toppedUp") }, { value: balance.breakdown?.granted, label: translate("balance.granted") }
				].filter((row) => row.value !== null && row.value !== void 0).map((row, index) => react_jsx_runtime.jsxs("div", { className: S.balanceRow, children: [react_jsx_runtime.jsx("span", { children: row.label }), react_jsx_runtime.jsx("span", { children: fmtCurrency(row.value, balance.currency) })] }, `${row.label}-${index}`)) })
			] });
		}

		function SubscriptionContent({ account, translate }) {
			const windows = Array.isArray(account.windows) ? account.windows : [];
			const status = typeof account.status === "string" ? account.status : "unavailable";
			const emptyMessage = status === "not-configured" ? translate("subscription.notConfigured", { refs: Array.isArray(account.missingCredentials) ? account.missingCredentials.join(" + ") : "" }) : status === "unauthorized" ? translate("subscription.unauthorized") : status === "rate-limited" ? translate("subscription.rateLimited") : status === "invalid-response" ? translate("account.invalidResponse") : status === "unsupported" ? translate("balance.unsupported") : translate("subscription.unavailable");
			if (!((status === "ok" || account.stale === true) && windows.length > 0)) return react_jsx_runtime.jsx("p", { className: S.quotaEmpty, children: emptyMessage });
			return react_jsx_runtime.jsx("div", { className: S.quotaList, children: windows.map((window) => {
				const used = Math.max(0, Math.min(100, Number(window.usedPercent) || 0));
				return react_jsx_runtime.jsxs("div", { className: S.quotaRow, children: [
					react_jsx_runtime.jsx("div", { className: S.quotaTitle, children: quotaLabel(window.kind, translate) }),
					react_jsx_runtime.jsx("div", { className: S.quotaTrack, role: "progressbar", "aria-label": quotaLabel(window.kind, translate), "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": used, children: react_jsx_runtime.jsx("div", { className: S.quotaFill, style: { width: `${used}%` } }) }),
					react_jsx_runtime.jsxs("div", { className: S.quotaMeta, children: [react_jsx_runtime.jsx("span", { className: S.quotaUsed, children: translate("subscription.used", { value: used.toFixed(used % 1 === 0 ? 0 : 1) }) }), react_jsx_runtime.jsx("span", { className: S.quotaReset, children: resetRelativeLabel(window.resetsAt, translate) })] })
				] }, window.kind);
			}) });
		}

		function AccountDetailPane({ provider, account, accountLoading, accountError, translate, onRetry, onClose }) {
			const mode = account?.mode ?? provider.accountMode ?? "balance";
			const status = accountLoading && account === null ? "loading" : account?.status ?? provider.status ?? "unavailable";
			const statusText = subscriptionStatusLabel(status, translate);
			const subtitle = account?.plan ?? provider.plan ?? (mode === "subscription" ? translate("subscription.planUnknown") : translate("account.balanceMode"));
			const activeBalance = account?.balance ?? provider.balance ?? null;
			const balanceState = accountLoading && account === null ? "loading" : accountError !== null ? "error" : status === "not-configured" ? "no-credential" : status === "unsupported" ? "unsupported" : activeBalance !== null ? "ok" : "error";
			const balanceMessage = accountError ?? account?.missingCredentials?.[0] ?? provider.missingCredentials?.[0] ?? status;
			return react_jsx_runtime.jsxs("article", { className: S.accountPane, "data-account-mode": mode, children: [
				react_jsx_runtime.jsxs("div", { className: S.accountHead, children: [
					react_jsx_runtime.jsx("span", { className: S.accountMark, "aria-hidden": true, children: providerMark(provider) }),
					react_jsx_runtime.jsxs("span", { className: S.accountIdentity, children: [react_jsx_runtime.jsx("span", { className: S.accountName, children: provider.displayName }), react_jsx_runtime.jsx("span", { className: S.accountPlan, children: `${subtitle} · ${updatedRelativeLabel(account?.fetchedAt ?? provider.fetchedAt, translate)}` })] }),
					react_jsx_runtime.jsx("span", { className: S.accountStatus, "data-status": status, children: statusText }),
					typeof onClose === "function" ? react_jsx_runtime.jsx("button", { type: "button", className: S.iconButton, "aria-label": translate("action.close"), onClick: onClose, children: react_jsx_runtime.jsx(primitives.IconCloseOutline16, { size: 14 }) }) : null
				] }),
				accountError !== null && mode === "subscription" ? react_jsx_runtime.jsxs("div", { className: S.error, children: [react_jsx_runtime.jsx("span", { children: translate("subscription.error", { message: accountError }) }), react_jsx_runtime.jsx("button", { type: "button", className: S.retry, onClick: onRetry, children: translate("action.retry") })] }) : accountLoading && account === null ? react_jsx_runtime.jsx("p", { className: S.quotaEmpty, children: mode === "subscription" ? translate("subscription.loading") : translate("balance.loading") }) : mode === "subscription" ? react_jsx_runtime.jsx(SubscriptionContent, { account: account ?? providerViewAccount(provider) ?? { status: "unavailable", windows: [] }, translate }) : react_jsx_runtime.jsx(BalanceContent, { balance: activeBalance, state: balanceState, message: balanceMessage, translate, onRetry }),
				status === "not-configured" ? react_jsx_runtime.jsx("p", { className: S.note, children: translate("account.configureHint") }) : null
			] });
		}

		function ProviderAccountCard(props) {
			return react_jsx_runtime.jsx(AccountDetailPane, props);
		}

		/** Credential configuration section within the account detail pane. */
		function CredentialSection({ provider, translate, onRefresh, heading = true }) {
			const [credInfo, setCredInfo] = react.useState(null);
			const [showKeyInput, setShowKeyInput] = react.useState(false);
			const [keyValue, setKeyValue] = react.useState("");
			const [oauthState, setOauthState] = react.useState(null);
			const [actionLoading, setActionLoading] = react.useState(false);
			const [actionError, setActionError] = react.useState(null);
			const mountedRef = react.useRef(true);
			react.useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

			const ref = provider.credentialRef ?? (provider.adapter === "copilot-device" ? "GITHUB_COPILOT_TOKEN" : null);
			const supportsImport = ["claude", "codex", "gemini", "grok", "amp"].includes(provider.id);
			const supportsDeviceFlow = provider.adapter === "copilot-device";

			const loadCredInfo = react.useCallback(() => {
				if (!ref) return;
				dbg("fetch credential info:", ref);
				fetchJson(`/api/usage-stats/credential?ref=${encodeURIComponent(ref)}`).then((payload) => {
					if (mountedRef.current && payload.ok === true) { dbg("credential info:", ref, "configured:", payload.configured); setCredInfo(payload); }
				}).catch((error) => { dbgWarn("credential info failed (server may need restart):", ref, error?.message ?? error); });
			}, [ref]);

			react.useEffect(() => { loadCredInfo(); }, [loadCredInfo]);

			const handleSetKey = () => {
				if (!ref || keyValue.trim() === "") return;
				setActionLoading(true);
				setActionError(null);
				fetch("/api/usage-stats/credential", {
					method: "POST",
					headers: { "content-type": "application/json", "x-dsh-usage-stats": "1" },
					body: JSON.stringify({ ref, value: keyValue.trim() })
				}).then(async (r) => {
					const body = await r.json();
					if (!mountedRef.current) return;
					if (body.ok === true) { setCredInfo(body); setShowKeyInput(false); setKeyValue(""); if (typeof onRefresh === "function") onRefresh(); }
					else setActionError(body.message ?? body.error ?? "failed");
				}).catch((e) => { if (mountedRef.current) setActionError(e instanceof Error ? e.message : String(e)); }).finally(() => { if (mountedRef.current) setActionLoading(false); });
			};

			const handleUnset = () => {
				if (!ref) return;
				setActionLoading(true);
				setActionError(null);
				fetch(`/api/usage-stats/credential?ref=${encodeURIComponent(ref)}`, {
					method: "DELETE",
					headers: { "content-type": "application/json", "x-dsh-usage-stats": "1" }
				}).then(async (r) => {
					const body = await r.json();
					if (!mountedRef.current) return;
					if (body.ok === true) { setCredInfo(body); if (typeof onRefresh === "function") onRefresh(); }
					else setActionError(body.message ?? body.error ?? "failed");
				}).catch((e) => { if (mountedRef.current) setActionError(e instanceof Error ? e.message : String(e)); }).finally(() => { if (mountedRef.current) setActionLoading(false); });
			};

			const handleImport = () => {
				setActionLoading(true);
				setActionError(null);
				fetch("/api/usage-stats/credential/import", {
					method: "POST",
					headers: { "content-type": "application/json", "x-dsh-usage-stats": "1" },
					body: JSON.stringify({ providerId: provider.id })
				}).then(async (r) => {
					const body = await r.json();
					if (!mountedRef.current) return;
					if (body.ok === true) { loadCredInfo(); if (typeof onRefresh === "function") onRefresh(); }
					else setActionError(body.error === "file-not-found" ? translate("credential.fileNotFound") : body.error === "no-token-in-file" ? translate("credential.noTokenInFile") : body.error ?? "failed");
				}).catch((e) => { if (mountedRef.current) setActionError(e instanceof Error ? e.message : String(e)); }).finally(() => { if (mountedRef.current) setActionLoading(false); });
			};

			const handleDeviceFlow = () => {
				setOauthState({ status: "requesting" });
				setActionError(null);
				// Device flow is driven server-side via a future endpoint; for now show instructions
				setOauthState({ status: "instruction", message: translate("credential.oauthInstruction") });
			};

			if (!ref) return null;
			const configured = credInfo?.configured === true;
			const writable = credInfo?.writable !== false;
			const source = credInfo?.source ?? "";

			return react_jsx_runtime.jsxs("div", { className: S.credSection, children: [
				heading ? react_jsx_runtime.jsxs("div", { className: S.credHead, children: [
					react_jsx_runtime.jsx(primitives.IconSettingsOutline14, { size: 12 }),
					react_jsx_runtime.jsx("span", { className: S.credLabel, children: translate("credential.title") }),
					react_jsx_runtime.jsx("span", { className: S.credStatus, children: configured ? `${translate("credential.configured")} (${source})` : translate("credential.missing") })
				] }) : null,
				actionError !== null ? react_jsx_runtime.jsx("div", { className: S.error, children: react_jsx_runtime.jsx("span", { children: actionError }) }) : null,
				showKeyInput ? react_jsx_runtime.jsxs("div", { className: S.credModal, children: [
					react_jsx_runtime.jsx("input", { type: "password", className: S.credInput, placeholder: ref, value: keyValue, onChange: (e) => setKeyValue(e.target.value), autoFocus: true }),
					react_jsx_runtime.jsx("span", { className: S.credHint, children: translate("credential.keyHint", { ref }) }),
					react_jsx_runtime.jsxs("div", { className: S.credActions, children: [
						react_jsx_runtime.jsx("button", { type: "button", className: S.credBtn, disabled: actionLoading || keyValue.trim() === "", onClick: handleSetKey, children: actionLoading ? translate("account.status.loading") : translate("credential.save") }),
						react_jsx_runtime.jsx("button", { type: "button", className: S.credBtn, onClick: () => { setShowKeyInput(false); setKeyValue(""); }, children: translate("action.close") })
					] })
				] }) : react_jsx_runtime.jsxs("div", { className: S.credActions, children: [
					writable ? react_jsx_runtime.jsx("button", { type: "button", className: S.credBtn, onClick: () => setShowKeyInput(true), children: [react_jsx_runtime.jsx(primitives.IconEditOutline16, { size: 12 }), configured ? translate("credential.update") : translate("credential.configure")] }) : null,
					supportsImport ? react_jsx_runtime.jsx("button", { type: "button", className: S.credBtn, disabled: actionLoading, onClick: handleImport, children: actionLoading ? translate("account.status.loading") : translate("credential.import") }) : null,
					supportsDeviceFlow ? react_jsx_runtime.jsx("button", { type: "button", className: S.credBtn, onClick: handleDeviceFlow, children: translate("credential.oauth") }) : null,
					configured && writable ? react_jsx_runtime.jsx("button", { type: "button", className: S.credBtn, "data-danger": true, disabled: actionLoading, onClick: handleUnset, children: translate("credential.clear") }) : null
				] }),
				oauthState !== null ? react_jsx_runtime.jsx("div", { className: S.oauthBox, children: react_jsx_runtime.jsx("span", { children: oauthState.message ?? translate("credential.oauthInstruction") }) }) : null
			] });
		}

		/** Pure settings section content (no data loading) — testable via SSR. */
		function SettingsSectionContent({ providers, hidden, density, historyMode, debugOn, serverReady, translate, onToggleVisibility, onChangeDensity, onChangeHistoryMode, onToggleDebug }) {
			const providerChoices = buildProviderChoices(providers);
			return react_jsx_runtime.jsxs("section", { className: S.setSection, children: [
				react_jsx_runtime.jsx("h2", { className: S.setTitle, children: translate("settings.title") }),
				react_jsx_runtime.jsx("p", { className: S.setIntro, children: translate("settings.intro") }),
				!serverReady ? react_jsx_runtime.jsx("div", { className: S.error, children: react_jsx_runtime.jsx("span", { children: translate("settings.serverRestartHint") }) }) : null,

				react_jsx_runtime.jsxs("div", { className: S.setGroup, children: [
					react_jsx_runtime.jsx("h3", { className: S.setGroupHead, children: translate("settings.visibility") }),
					react_jsx_runtime.jsxs("div", { className: S.setCard, children: [
						react_jsx_runtime.jsx("div", { className: S.manageList, children: providerChoices.map((p) => {
							const visible = !hidden.has(p.id);
							return react_jsx_runtime.jsxs("div", { className: S.manageRow, children: [
								react_jsx_runtime.jsx("span", { className: S.manageName, children: p.displayName }),
								react_jsx_runtime.jsx("button", { type: "button", className: S.switch, "data-on": visible, "aria-label": visible ? translate("action.hide") : translate("action.show"), onClick: () => onToggleVisibility(p.id) })
							] }, p.id);
						}) }),
						react_jsx_runtime.jsx("p", { className: S.setIntro, children: translate("settings.visibilityNote") })
					] })
				] }),

				react_jsx_runtime.jsxs("div", { className: S.setGroup, children: [
					react_jsx_runtime.jsx("h3", { className: S.setGroupHead, children: translate("settings.credentials") }),
					react_jsx_runtime.jsx("div", { className: S.setCard, children: providerChoices.map((p) => {
						const ref = p.credentialRef ?? (p.adapter === "copilot-device" ? "GITHUB_COPILOT_TOKEN" : null);
						return react_jsx_runtime.jsxs("div", { key: p.id, children: [
							react_jsx_runtime.jsx("div", { className: S.setName, children: p.displayName }),
							ref !== null ? react_jsx_runtime.jsx("div", { className: S.setRef, children: ref }) : null,
							react_jsx_runtime.jsx(CredentialSection, { provider: p, translate, heading: false })
						] });
					}) })
				] }),

				react_jsx_runtime.jsxs("div", { className: S.setGroup, children: [
					react_jsx_runtime.jsx("h3", { className: S.setGroupHead, children: translate("settings.displayDefaults") }),
					react_jsx_runtime.jsxs("div", { className: S.setCard, children: [
						react_jsx_runtime.jsx("div", { className: S.manageRow, children: [
							react_jsx_runtime.jsx("span", { className: S.manageName, children: translate("settings.density") }),
							react_jsx_runtime.jsx("div", { className: S.density, children: ["detailed", "compact"].map((value) => react_jsx_runtime.jsx("button", { type: "button", className: S.segmentButton, ...(density === value ? { "data-active": true } : {}), onClick: () => onChangeDensity(value), children: translate(`panel.${value}`) }, value)) })
						] }),
						react_jsx_runtime.jsx("div", { className: S.manageRow, children: [
							react_jsx_runtime.jsx("span", { className: S.manageName, children: translate("settings.historyMode") }),
							react_jsx_runtime.jsx("div", { className: S.density, children: ["daily", "weekly", "total"].map((value) => react_jsx_runtime.jsx("button", { type: "button", className: S.segmentButton, ...(historyMode === value ? { "data-active": true } : {}), onClick: () => onChangeHistoryMode(value), children: translate(`usage.bucket.${value}`) }, value)) })
						] })
					] })
				] }),

				react_jsx_runtime.jsxs("div", { className: S.setGroup, children: [
					react_jsx_runtime.jsx("h3", { className: S.setGroupHead, children: translate("settings.debug") }),
					react_jsx_runtime.jsxs("div", { className: S.setCard, children: [
						react_jsx_runtime.jsx("div", { className: S.manageRow, children: [
							react_jsx_runtime.jsx("span", { className: S.manageName, children: translate("settings.debugLabel") }),
							react_jsx_runtime.jsx("button", { type: "button", className: S.switch, "data-on": debugOn, "aria-label": translate("settings.debugLabel"), onClick: () => onToggleDebug(!debugOn) })
						] }),
						react_jsx_runtime.jsx("p", { className: S.setIntro, children: translate("settings.debugNote") })
					] })
				] })
			] });
		}

		/** Settings section: provider visibility, credentials, display defaults, debug. */
		function UsageStatsSettingsSection({ close, t }) {
			const translate = (key, params) => interpolate(t !== void 0 ? t(key) : key, params);
			const [providers, setProviders] = react.useState([]);
			const [providersLoaded, setProvidersLoaded] = react.useState(false);
			const [hidden, setHidden] = react.useState(new Set());
			const [density, setDensity] = react.useState("detailed");
			const [historyMode, setHistoryMode] = react.useState("daily");
			const [serverReady, setServerReady] = react.useState(true);
			const [debugOn, setDebugOn] = react.useState(() => {
				try { return localStorage.getItem("dsh-usage-stats-debug") === "1"; } catch { return true; }
			});
			const mountedRef = react.useRef(true);
			react.useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

			react.useEffect(() => {
				dbg("settings section: loading providers + prefs");
				fetchJson("/api/usage-stats/providers").then((payload) => {
					if (!mountedRef.current) return;
					if (payload.ok !== true) return;
					setProviders(Array.isArray(payload.providers) ? payload.providers : []);
					setProvidersLoaded(true);
				}).catch((error) => { dbgWarn("settings providers fetch failed:", error?.message ?? error); if (mountedRef.current) setServerReady(false); });
				fetchJson("/api/usage-stats/prefs").then((payload) => {
					if (!mountedRef.current || payload.ok !== true) return;
					const p = payload.prefs ?? {};
					setHidden(new Set(Array.isArray(p.hiddenProviders) ? p.hiddenProviders : []));
					if (p.density === "compact" || p.density === "detailed") setDensity(p.density);
					if (["daily", "weekly", "total"].includes(p.historyMode)) setHistoryMode(p.historyMode);
				}).catch((error) => { dbgWarn("settings prefs fetch failed:", error?.message ?? error); if (mountedRef.current) setServerReady(false); });
			}, []);

			const savePrefs = react.useCallback((next) => {
				fetch("/api/usage-stats/prefs", {
					method: "PUT",
					headers: { "content-type": "application/json", "x-dsh-usage-stats": "1" },
					body: JSON.stringify({ prefs: next })
				}).catch((error) => { dbgWarn("prefs save failed:", error?.message ?? error); });
			}, []);

			const toggleVisibility = (providerId) => {
				setHidden((prev) => {
					const next = new Set(prev);
					if (next.has(providerId)) next.delete(providerId); else next.add(providerId);
					savePrefs({ hiddenProviders: Array.from(next), density, historyMode });
					return next;
				});
			};

			const changeDensity = (value) => { setDensity(value); savePrefs({ hiddenProviders: Array.from(hidden), density: value, historyMode }); };
			const changeHistoryMode = (value) => { setHistoryMode(value); savePrefs({ hiddenProviders: Array.from(hidden), density, historyMode: value }); };
			const toggleDebug = (enabled) => { setDebug(enabled); setDebugOn(enabled); };

			return react_jsx_runtime.jsx(SettingsSectionContent, {
				providers, hidden, density, historyMode, debugOn, serverReady, translate,
				onToggleVisibility: toggleVisibility,
				onChangeDensity: changeDensity,
				onChangeHistoryMode: changeHistoryMode,
				onToggleDebug: toggleDebug
			});
		}
		//#endregion

		//#region usage components
		function ActivityHeatmap({ heat, translate, selectedKey, onSelect }) {
			const select = typeof onSelect === "function" ? onSelect : () => {};
			const weekCount = heat.weeks.length;
			const gridColumns = `repeat(${weekCount},10px)`;
			const flatByRow = [];
			for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) flatByRow.push(heat.weeks[weekIndex][dayIndex]);
			return react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, { children: [
				react_jsx_runtime.jsx("div", { className: S.heatScroll, children: react_jsx_runtime.jsxs("div", { className: S.heatCanvas, children: [
					react_jsx_runtime.jsx("div", { className: S.monthLabels, style: { gridTemplateColumns: gridColumns }, children: heat.monthLabels.map((label) => react_jsx_runtime.jsx("span", { className: S.monthLabel, style: { gridColumn: `${label.weekIndex + 1} / span 4` }, children: monthName(label.month, translate) }, `${label.year}-${label.month}`)) }),
					react_jsx_runtime.jsx("div", { className: S.heatGrid, style: { gridTemplateColumns: gridColumns, gridTemplateRows: "repeat(7,10px)" }, children: flatByRow.map((cell) => {
						const style = cellColor(cell.tokens, heat.max);
						const modeValue = heat.mode === "daily" ? "" : ` · ${translate(`usage.bucket.${heat.mode}`)} ${fmt(cell.tokens)}`;
						const hit = cell.hitRate === null || cell.hitRate === void 0 ? "" : ` · ${translate("usage.hitRate")} ${cell.hitRate}%`;
						return react_jsx_runtime.jsx("button", { type: "button", className: S.heatCell, style, disabled: cell.future || cell.rawTokens <= 0, ...(selectedKey === cell.key ? { "data-selected": true } : {}), title: `${cell.key} · ${fmt(cell.rawTokens)} tokens${modeValue}${hit}`, "aria-label": `${cell.key} · ${fmt(cell.rawTokens)} tokens`, onClick: () => select(cell.key) }, cell.key);
					}) })
				] }) }),
				react_jsx_runtime.jsxs("div", { className: S.heatLegend, children: [
					react_jsx_runtime.jsx("span", { children: translate("usage.legendLess") }),
					[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => react_jsx_runtime.jsx("span", { className: S.legendSwatch, style: cellColor(ratio === 0 ? 0 : ratio * Math.max(heat.max, 1), Math.max(heat.max, 1)) }, index)),
					react_jsx_runtime.jsx("span", { children: translate("usage.legendMore") })
				] })
			] });
		}

		function DayDetail({ day, translate, onBack }) {
			const models = Array.isArray(day.models) ? day.models : [];
			const totalTokens = day.tokens ?? 0;
			return react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, { children: [
				react_jsx_runtime.jsxs("div", { className: S.detailHeader, children: [react_jsx_runtime.jsx("button", { type: "button", className: S.back, "aria-label": translate("usage.back"), onClick: onBack, children: react_jsx_runtime.jsx(primitives.IconChevronLeftOutline14, { size: 14 }) }), react_jsx_runtime.jsx("span", { className: S.detailDate, children: dayLabel(day.date, translate) }), react_jsx_runtime.jsx("span", { className: S.detailHit, children: `${translate("usage.hitRate")} ${fmtHit(day.cacheHitRate)}` })] }),
				react_jsx_runtime.jsx("p", { className: S.detailSummary, children: `${translate("usage.total")} ${fmt(totalTokens)} · ${translate("usage.input")} ${fmt(day.inputTokens ?? 0)} · ${translate("usage.output")} ${fmt(day.outputTokens ?? 0)} · ${translate("usage.cacheRead")} ${fmt(day.cacheReadTokens ?? 0)}` }),
				react_jsx_runtime.jsx("div", { className: S.modelList, children: models.length === 0 ? react_jsx_runtime.jsx("p", { className: S.note, children: translate("usage.noModels") }) : models.map((model) => {
					const share = totalTokens > 0 ? Math.max(3, Math.round(100 * (model.tokens ?? 0) / totalTokens)) : 0;
					return react_jsx_runtime.jsxs("div", { className: S.modelRow, children: [react_jsx_runtime.jsxs("div", { className: S.modelHead, children: [react_jsx_runtime.jsx("span", { className: S.modelName, title: model.model, children: modelLabelOf(model.model, translate) }), react_jsx_runtime.jsx("span", { className: S.modelTokens, children: fmt(model.tokens ?? 0) }), react_jsx_runtime.jsx("span", { className: S.modelHit, children: fmtHit(model.cacheHitRate) })] }), react_jsx_runtime.jsx("div", { className: S.modelBarTrack, children: react_jsx_runtime.jsx("div", { className: S.modelBar, style: { width: `${share}%` } }) }), react_jsx_runtime.jsx("div", { className: S.modelMeta, children: `${translate("usage.input")} ${fmt(model.inputTokens ?? 0)} · ${translate("usage.output")} ${fmt(model.outputTokens ?? 0)} · ${translate("usage.cacheRead")} ${fmt(model.cacheReadTokens ?? 0)}` })] }, model.model);
				}) })
			] });
		}

		function HistoryPane({ usage, usageError, mode, setMode, selectedEntry, dayMap, stats, translate, onSelectDay, onBackDay, onClose, onRetry }) {
			const heat = react.useMemo(() => buildActivityHeatmap(dayMap, mode), [dayMap, mode]);
			return react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, { children: [
				react_jsx_runtime.jsxs("header", { className: S.header, children: [react_jsx_runtime.jsxs("div", { className: S.headerLeft, children: [react_jsx_runtime.jsx(primitives.IconDataOutline16, { size: 16 }), react_jsx_runtime.jsxs("span", { className: S.headerIdentity, children: [react_jsx_runtime.jsx("span", { className: S.title, children: translate("usage.activity") }), react_jsx_runtime.jsx("span", { className: S.subtitle, children: translate("usage.activityRange") })] })] }), react_jsx_runtime.jsx("button", { type: "button", className: S.iconButton, "aria-label": translate("action.close"), onClick: onClose, children: react_jsx_runtime.jsx(primitives.IconCloseOutline16, { size: 14 }) })] }),
				react_jsx_runtime.jsx("div", { className: S.flyoutBody, children: selectedEntry !== null ? react_jsx_runtime.jsx(DayDetail, { day: selectedEntry, translate, onBack: onBackDay }) : react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, { children: [
					react_jsx_runtime.jsxs("div", { className: S.historyHead, children: [react_jsx_runtime.jsx("span", { className: S.historyTitle, children: translate("usage.activity") }), react_jsx_runtime.jsx("div", { className: S.historyModes, children: ["daily", "weekly", "total"].map((value) => react_jsx_runtime.jsx("button", { type: "button", className: S.segmentButton, ...(mode === value ? { "data-active": true } : {}), onClick: () => setMode(value), children: translate(`usage.bucket.${value}`) }, value)) })] }),
					stats !== null ? react_jsx_runtime.jsxs("div", { className: S.statsInline, children: [react_jsx_runtime.jsxs("span", { children: [translate("usage.today"), " ", react_jsx_runtime.jsx("b", { children: fmtCompact(stats.dayTokens) })] }), react_jsx_runtime.jsxs("span", { children: [translate("usage.month"), " ", react_jsx_runtime.jsx("b", { children: fmtCompact(stats.monthTokens) })] }), react_jsx_runtime.jsxs("span", { children: [translate("usage.total"), " ", react_jsx_runtime.jsx("b", { children: fmtCompact(stats.total) })] }), react_jsx_runtime.jsxs("span", { children: [translate("usage.hit.today"), " ", react_jsx_runtime.jsx("b", { children: fmtHit(stats.todayHit) })] })] }) : null,
					usageError !== null ? react_jsx_runtime.jsxs("div", { className: S.error, children: [react_jsx_runtime.jsx("span", { children: translate("usage.error", { message: usageError }) }), react_jsx_runtime.jsx("button", { type: "button", className: S.retry, onClick: onRetry, children: translate("action.retry") })] }) : usage === null ? react_jsx_runtime.jsx("p", { className: S.quotaEmpty, children: translate("usage.loading") }) : react_jsx_runtime.jsx(ActivityHeatmap, { heat, translate, selectedKey: null, onSelect: onSelectDay })
				] }) })
			] });
		}
		//#endregion

		//#region panel
		/**
		 * Render crash containment: without a boundary, any render error inside
		 * the open surface unmounts the whole slot entry and the sidebar button
		 * silently vanishes. The boundary keeps the badge alive, shows an inline
		 * fallback, and always logs the error + component stack to the console
		 * with the [usg] prefix so failures stay diagnosable in the field.
		 */
		class PanelErrorBoundary extends react.Component {
			constructor(props) { super(props); this.state = { error: null }; }
			static getDerivedStateFromError(error) { return { error }; }
			componentDidCatch(error, info) {
				dbgError("panel render crashed:", error?.message ?? error);
				if (info?.componentStack) dbgError("component stack:", info.componentStack);
			}
			reset(close) {
				this.setState({ error: null });
				if (close === true) this.props.onClose?.();
			}
			render() {
				const { error } = this.state;
				if (error === null) return this.props.children;
				const translate = this.props.translate;
				return react_jsx_runtime.jsx("div", { className: S.surface, "data-open": true, "data-usg-crash": true, children: react_jsx_runtime.jsxs("section", { className: S.panel, children: [
					react_jsx_runtime.jsx("p", { className: S.error, children: translate("panel.crash", { message: error?.message ?? String(error) }) }),
					react_jsx_runtime.jsxs("div", { className: S.headerActions, children: [
						react_jsx_runtime.jsx("button", { type: "button", className: S.segmentButton, onClick: () => this.reset(false), children: translate("action.retry") }),
						react_jsx_runtime.jsx("button", { type: "button", className: S.segmentButton, onClick: () => this.reset(true), children: translate("action.close") })
					] })
				] }) });
			}
		}

		function UsageStatsPanel({ wide, t }) {
			const translate = (key, params) => interpolate(t !== void 0 ? t(key) : key, params);
			const [open, setOpen] = react.useState(false);
			const [providers, setProviders] = react.useState([]);
			const [providersLoaded, setProvidersLoaded] = react.useState(false);
			const [usage, setUsage] = react.useState(null);
			const [usageError, setUsageError] = react.useState(null);
			const [selectedProvider, setSelectedProvider] = react.useState(null);
			const [account, setAccount] = react.useState(null);
			const [accountLoading, setAccountLoading] = react.useState(false);
			const [accountError, setAccountError] = react.useState(null);
			const [flyout, setFlyout] = react.useState(null);
			const [density, setDensity] = react.useState("detailed");
			const [historyMode, setHistoryMode] = react.useState("daily");
			const [selectedDay, setSelectedDay] = react.useState(null);
			const [hiddenProviders, setHiddenProviders] = react.useState(new Set());
			const [prefsLoaded, setPrefsLoaded] = react.useState(false);
			const rootRef = react.useRef(null);
			const mountedRef = react.useRef(true);
			const usageLoaderRef = react.useRef(null);
			const providerLoaderRef = react.useRef(null);
			const accountLoaderRef = react.useRef(null);
			if (usageLoaderRef.current === null) usageLoaderRef.current = createLoader();
			if (providerLoaderRef.current === null) providerLoaderRef.current = createLoader();
			if (accountLoaderRef.current === null) accountLoaderRef.current = createLoader();

			const providerChoices = react.useMemo(() => buildProviderChoices(providers), [providers]);
			const selectedProviderInfo = providerChoices.find((provider) => provider.id === selectedProvider) ?? null;
			const detailAccount = account?.id === selectedProvider ? account : providerViewAccount(selectedProviderInfo);
			const closePanel = react.useCallback(() => { dbg("closePanel"); setOpen(false); setFlyout(null); setSelectedDay(null); }, []);

			const loadUsage = react.useCallback(() => {
				const seq = usageLoaderRef.current.start();
				setUsageError(null);
				dbg("fetch usage, seq:", seq);
				fetchJson("/api/usage-stats/usage").then((payload) => {
					if (!mountedRef.current || !usageLoaderRef.current.isCurrent(seq)) { dbg("usage response stale, seq:", seq); return; }
					if (payload.ok !== true) { dbgWarn("usage fetch failed:", payload.message); setUsageError(payload.message ?? "usage aggregation failed"); return; }
					dbg("usage loaded, days:", Array.isArray(payload.days) ? payload.days.length : 0);
					setUsage(payload);
				}).catch((error) => { dbgError("usage fetch error:", error); if (mountedRef.current && usageLoaderRef.current.isCurrent(seq)) setUsageError(error instanceof Error ? error.message : String(error)); });
			}, []);

			const loadProviders = react.useCallback((force = false) => {
				const seq = providerLoaderRef.current.start();
				dbg("fetch providers, seq:", seq, force ? "(force)" : "");
				fetchJson(`/api/usage-stats/providers${force ? "?refresh=1" : ""}`).then((payload) => {
					if (!mountedRef.current || !providerLoaderRef.current.isCurrent(seq)) { dbg("providers response stale, seq:", seq); return; }
					setProvidersLoaded(true);
					if (payload.ok === true) {
						const list = Array.isArray(payload.providers) ? payload.providers : [];
						dbg("providers loaded:", list.length, "providers");
						setProviders(list);
					} else { dbgWarn("providers fetch failed:", payload); }
				}).catch((error) => { dbgError("providers fetch error:", error); if (mountedRef.current && providerLoaderRef.current.isCurrent(seq)) setProvidersLoaded(true); });
			}, []);

			const loadAccount = react.useCallback((providerId, force = false) => {
				const seq = accountLoaderRef.current.start();
				setAccountLoading(true);
				setAccountError(null);
				const query = `?provider=${encodeURIComponent(providerId)}${force ? "&refresh=1" : ""}`;
				dbg("fetch account:", providerId, "seq:", seq, force ? "(force)" : "");
				fetchJson(`/api/usage-stats/account${query}`).then((payload) => {
					if (!mountedRef.current || !accountLoaderRef.current.isCurrent(seq)) { dbg("account response stale, seq:", seq); return; }
					if (payload.ok !== true) { dbgWarn("account fetch failed:", payload.message); setAccountError(payload.message ?? "account fetch failed"); return; }
					dbg("account loaded:", providerId, "status:", payload.account?.status);
					setAccount(payload.account);
				}).catch((error) => { dbgError("account fetch error:", providerId, error); if (mountedRef.current && accountLoaderRef.current.isCurrent(seq)) setAccountError(error instanceof Error ? error.message : String(error)); }).finally(() => { if (mountedRef.current && accountLoaderRef.current.isCurrent(seq)) setAccountLoading(false); });
			}, []);

			react.useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
			react.useEffect(() => {
				if (!open) return;
				loadUsage(); loadProviders();
				const usageTimer = window.setInterval(loadUsage, 60000);
				const providerTimer = window.setInterval(() => loadProviders(false), 300000);
				return () => { window.clearInterval(usageTimer); window.clearInterval(providerTimer); };
			}, [open, loadUsage, loadProviders]);
			react.useEffect(() => {
				if (!open || flyout !== "account" || selectedProvider === null) return;
				loadAccount(selectedProvider);
				const timer = window.setInterval(() => loadAccount(selectedProvider), 300000);
				return () => window.clearInterval(timer);
			}, [open, flyout, selectedProvider, loadAccount]);
			react.useEffect(() => {
				if (!open) return;
				// Skip the first pointerdown after opening to avoid the race where
				// the same click that opened the panel also triggers the outside-click
				// handler before the user can release the button.
				let skipFirst = true;
				const rafId = requestAnimationFrame(() => { skipFirst = false; });
				const onPointerDown = (event) => {
					if (skipFirst) return;
					if (typeof Node !== "undefined" && event.target instanceof Node && rootRef.current?.contains(event.target) === true) return;
					dbg("outside-click, dismissing panel");
					if (dismissAction({ outside: true }) === "panel") closePanel();
				};
				const onKeyDown = (event) => {
					if (event.key !== "Escape") return;
					const action = dismissAction({ escape: true, flyout, selectedDay });
					dbg("escape-key, action:", action);
					if (action === "day") setSelectedDay(null);
					else if (action === "flyout") setFlyout(null);
					else closePanel();
				};
				document.addEventListener("pointerdown", onPointerDown);
				document.addEventListener("keydown", onKeyDown);
				return () => { cancelAnimationFrame(rafId); document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
			}, [open, flyout, selectedDay, closePanel]);

			// Load prefs on mount
			react.useEffect(() => {
				dbg("loading prefs");
				fetchJson("/api/usage-stats/prefs").then((payload) => {
					if (!mountedRef.current || payload.ok !== true) { dbg("prefs not available or stale"); return; }
					const p = payload.prefs ?? {};
					const hidden = Array.isArray(p.hiddenProviders) ? p.hiddenProviders : [];
					dbg("prefs loaded, hidden:", hidden.length, "density:", p.density, "historyMode:", p.historyMode);
					setHiddenProviders(new Set(hidden));
					if (p.density === "compact" || p.density === "detailed") setDensity(p.density);
					if (["daily", "weekly", "total"].includes(p.historyMode)) setHistoryMode(p.historyMode);
					setPrefsLoaded(true);
				}).catch((error) => { dbgWarn("prefs fetch failed (server may need restart):", error?.message ?? error); if (mountedRef.current) setPrefsLoaded(true); });
			}, []);

			const dayMap = react.useMemo(() => {
				const map = new Map();
				if (usage !== null && Array.isArray(usage.days)) for (const day of usage.days) map.set(day.date, day);
				return map;
			}, [usage]);
			const stats = react.useMemo(() => {
				if (usage === null || !Array.isArray(usage.days)) return null;
				const today = todayKey();
				const month = today.slice(0, 7);
				let todayEntry = null;
				let dayTokens = 0;
				let monthTokens = 0;
				for (const day of usage.days) { if (day.date === today) { dayTokens = day.tokens ?? 0; todayEntry = day; } if (day.date.startsWith(month)) monthTokens += day.tokens ?? 0; }
				return { dayTokens, monthTokens, total: usage.total?.tokens ?? 0, todayHit: todayEntry?.cacheHitRate ?? null };
			}, [usage]);
			const selectedEntry = selectedDay !== null ? dayMap.get(selectedDay) ?? null : null;
			const badgeCount = stats !== null ? fmtCompact(stats.dayTokens) : null;
			const refresh = () => { loadUsage(); loadProviders(true); if (flyout === "account" && selectedProvider !== null) loadAccount(selectedProvider, true); };
			const chooseProvider = (id) => { dbg("chooseProvider:", id); setSelectedProvider(id); setSelectedDay(null); setFlyout("account"); };

			return react_jsx_runtime.jsxs("div", { ref: rootRef, className: wide ? S.layer : `${S.layer} ${S.rail}`, children: [
				react_jsx_runtime.jsx(PanelErrorBoundary, { translate, onClose: closePanel, children: open ? react_jsx_runtime.jsxs("div", { className: S.surface, "data-open": true, role: "dialog", "aria-label": translate("panel.title"), children: [
					react_jsx_runtime.jsxs("section", { className: S.panel, "data-usage-stats-panel": true, children: [
						react_jsx_runtime.jsxs("header", { className: S.header, children: [
							react_jsx_runtime.jsxs("div", { className: S.headerLeft, children: [react_jsx_runtime.jsx(primitives.IconDataOutline16, { size: 16 }), react_jsx_runtime.jsx("span", { className: S.title, children: translate("panel.title") })] }),
							react_jsx_runtime.jsxs("div", { className: S.headerActions, children: [react_jsx_runtime.jsx("span", { className: S.headerMeta, children: translate("panel.allProviders") }), react_jsx_runtime.jsx(primitives.Tooltip, { label: translate("action.refresh"), side: "bottom", delayMs: 500, children: react_jsx_runtime.jsx("button", { type: "button", className: S.iconButton, "aria-label": translate("action.refresh"), onClick: refresh, children: react_jsx_runtime.jsx(primitives.IconRefreshOutline14, { size: 14 }) }) }), react_jsx_runtime.jsx(primitives.Tooltip, { label: translate("action.close"), side: "bottom", delayMs: 500, children: react_jsx_runtime.jsx("button", { type: "button", className: S.iconButton, "aria-label": translate("action.close"), onClick: closePanel, children: react_jsx_runtime.jsx(primitives.IconCloseOutline16, { size: 14 }) }) })] })
						] }),
						react_jsx_runtime.jsx("div", { className: S.density, children: ["detailed", "compact"].map((value) => react_jsx_runtime.jsx("button", { type: "button", className: S.segmentButton, ...(density === value ? { "data-active": true } : {}), onClick: () => setDensity(value), children: translate(`panel.${value}`) }, value)) }),
						react_jsx_runtime.jsx("div", { className: S.body, children: !providersLoaded ? react_jsx_runtime.jsx("p", { className: S.note, children: translate("account.loading") }) : react_jsx_runtime.jsx(AccountList, { providers: providerChoices, selectedProvider: flyout === "account" ? selectedProvider : null, density, hiddenSet: hiddenProviders, translate, onSelect: chooseProvider }) }),
						react_jsx_runtime.jsx("div", { className: S.panelFooter, children: react_jsx_runtime.jsxs("button", { type: "button", className: S.footerAction, ...(flyout === "history" ? { "data-active": true } : {}), onClick: () => { setSelectedDay(null); setFlyout("history"); }, children: [react_jsx_runtime.jsx("span", { children: translate("usage.history") }), react_jsx_runtime.jsx(primitives.IconChevronRightOutline14, { size: 13 })] }) })
					] }),
					flyout === "account" && selectedProviderInfo !== null ? react_jsx_runtime.jsx("section", { className: S.flyout, "data-kind": "account", children: react_jsx_runtime.jsx("div", { className: S.flyoutBody, children: react_jsx_runtime.jsx(AccountDetailPane, { provider: selectedProviderInfo, account: detailAccount, accountLoading, accountError, translate, onRetry: () => loadAccount(selectedProvider, true), onClose: () => setFlyout(null) }) }) }) : null,
					flyout === "history" ? react_jsx_runtime.jsx("section", { className: S.flyout, "data-kind": selectedEntry === null ? "history" : "day", children: react_jsx_runtime.jsx(HistoryPane, { usage, usageError, mode: historyMode, setMode: setHistoryMode, selectedEntry, dayMap, stats, translate, onSelectDay: setSelectedDay, onBackDay: () => setSelectedDay(null), onClose: () => { setFlyout(null); setSelectedDay(null); }, onRetry: loadUsage }) }) : null
				] }) : null }),
				react_jsx_runtime.jsx("div", { className: S.footerButtons, children: react_jsx_runtime.jsxs("button", { type: "button", className: S.badge, "data-usage-stats-badge": true, ...(open ? { "data-active": true } : {}), "aria-label": translate("panel.badge"), "aria-expanded": open, onClick: () => { dbg("badge click, open:", open); if (open) closePanel(); else { dbg("opening panel"); setOpen(true); } }, children: [react_jsx_runtime.jsx(primitives.IconDataOutline16, { size: wide ? 14 : 18 }), wide ? react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, { children: [react_jsx_runtime.jsx("span", { className: S.badgeLabel, children: translate("panel.badge") }), badgeCount !== null ? react_jsx_runtime.jsx("span", { className: S.badgeCount, children: badgeCount }) : null] }) : null] }) })
			] });
		}
		//#endregion

		//#region locales
		const NS = "usageStats";
		const zh = {
			"panel.title": "使用量", "panel.badge": "用量/余额", "panel.allProviders": "全部供应商", "panel.detailed": "详细", "panel.compact": "精简", "panel.updatedJustNow": "刚刚更新", "panel.updatedAgo": "{time}前更新", "panel.updatedUnknown": "尚未更新", "panel.crash": "面板渲染出错：{message}（详见控制台 [usg] 日志）",
			"account.balanceMode": "API 余额", "account.loading": "正在加载供应商…", "account.status.loading": "查询中", "account.status.unsupported": "不支持", "account.status.invalidResponse": "响应异常", "account.invalidResponse": "供应商返回了无法识别的额度数据。", "account.configureHint": "凭据请在 设置 → 用量统计 中配置。",
			"balance.total": "总余额", "balance.remaining": "可用余额", "balance.used": "已使用", "balance.toppedUp": "充值余额", "balance.granted": "赠送余额", "balance.loading": "正在查询余额…", "balance.unsupported": "该供应商没有公开的余额查询接口。", "balance.noCredential": "未配置 {ref}（请编辑 ~/.dsh/.credentials.yaml）", "balance.error": "余额获取失败：{message}",
			"subscription.loading": "正在查询订阅额度…", "subscription.error": "订阅额度获取失败：{message}", "subscription.status.ok": "实时", "subscription.status.notConfigured": "未配置", "subscription.status.unauthorized": "需重新登录", "subscription.status.rateLimited": "请求受限", "subscription.status.unavailable": "暂不可用", "subscription.window.session": "会话", "subscription.window.daily": "每日", "subscription.window.weekly": "每周", "subscription.window.monthly": "每月", "subscription.window.quota": "总额度", "subscription.window.mcp": "MCP 月度额度", "subscription.used": "已用 {value}%", "subscription.resetsIn": "{time} 后重置", "subscription.resetDue": "等待重置", "subscription.notConfigured": "配置 {refs} 后显示真实订阅比例。", "subscription.unauthorized": "凭据已失效，请更新后重试。", "subscription.rateLimited": "供应商暂时限制查询，请稍后重试。", "subscription.unavailable": "供应商没有返回可识别的额度窗口。", "subscription.planUnknown": "订阅计划",
			"usage.history": "使用详情与历史", "usage.activity": "Token 活动", "usage.activityRange": "过去约 12 个月", "usage.today": "今日", "usage.month": "本月", "usage.total": "累计", "usage.loading": "正在统计用量…", "usage.error": "用量统计失败：{message}", "usage.bucket.daily": "每日", "usage.bucket.weekly": "每周", "usage.bucket.total": "累计", "usage.legendLess": "少", "usage.legendMore": "多", "usage.back": "返回", "usage.hitRate": "缓存命中", "usage.hit.today": "今日缓存命中", "usage.input": "输入", "usage.output": "输出", "usage.cacheRead": "缓存读", "usage.unknownModel": "未知模型", "usage.noModels": "这一天没有分模型数据。",
			"credential.title": "凭据配置", "credential.configured": "已配置", "credential.missing": "未配置", "credential.configure": "配置 API Key", "credential.update": "更新 API Key", "credential.save": "保存", "credential.import": "从本地文件导入", "credential.oauth": "OAuth 登录", "credential.clear": "清除凭据", "credential.keyHint": "密钥将安全存储到 ~/.dsh/.credentials.yaml，不会发送到浏览器。引用名：{ref}", "credential.fileNotFound": "未找到本地凭据文件", "credential.noTokenInFile": "本地文件中未找到有效令牌", "credential.oauthInstruction": "请在终端运行对应 CLI 的登录命令完成授权，然后使用「从本地文件导入」按钮同步凭据。",
			"prefs.allHidden": "所有供应商已隐藏。请在 设置 → 用量统计 中恢复。",
			"settings.nav": "用量统计", "settings.title": "用量统计", "settings.intro": "配置供应商凭据、列表显示与默认偏好；弹出框专注额度展示。", "settings.serverRestartHint": "部分配置功能需要重启 dsh web 后生效。", "settings.visibility": "供应商显示", "settings.visibilityNote": "隐藏的供应商仍会在后台刷新，只是不出现在弹出框列表中。", "settings.credentials": "凭据配置", "settings.displayDefaults": "显示偏好", "settings.density": "列表密度", "settings.historyMode": "热力图默认模式", "settings.debug": "调试日志", "settings.debugLabel": "调试日志开关", "settings.debugNote": "开启后在浏览器控制台输出 [usg] 前缀的诊断日志。",
			"action.show": "显示", "action.hide": "隐藏",
			"action.refresh": "刷新", "action.retry": "重试", "action.close": "关闭", "weekday.mon": "一", "weekday.tue": "二", "weekday.wed": "三", "weekday.thu": "四", "weekday.fri": "五", "weekday.sat": "六", "weekday.sun": "日", "month.names": "1月,2月,3月,4月,5月,6月,7月,8月,9月,10月,11月,12月"
		};
		const en = {
			"panel.title": "Usage", "panel.badge": "Usage/Balance", "panel.allProviders": "All providers", "panel.detailed": "Detailed", "panel.compact": "Compact", "panel.updatedJustNow": "Updated just now", "panel.updatedAgo": "Updated {time} ago", "panel.updatedUnknown": "Not updated yet", "panel.crash": "Panel render error: {message} (see [usg] console logs)",
			"account.balanceMode": "API balance", "account.loading": "Loading providers…", "account.status.loading": "Loading", "account.status.unsupported": "Unsupported", "account.status.invalidResponse": "Invalid response", "account.invalidResponse": "The provider returned unrecognized quota data.", "account.configureHint": "Configure credentials in Settings → Usage Stats.",
			"balance.total": "Total balance", "balance.remaining": "Available balance", "balance.used": "Used", "balance.toppedUp": "Topped up", "balance.granted": "Granted", "balance.loading": "Fetching balance…", "balance.unsupported": "This provider has no public balance interface.", "balance.noCredential": "{ref} is not configured (edit ~/.dsh/.credentials.yaml)", "balance.error": "Balance fetch failed: {message}",
			"subscription.loading": "Fetching subscription usage…", "subscription.error": "Subscription usage failed: {message}", "subscription.status.ok": "Live", "subscription.status.notConfigured": "Not configured", "subscription.status.unauthorized": "Sign in again", "subscription.status.rateLimited": "Rate limited", "subscription.status.unavailable": "Unavailable", "subscription.window.session": "Session", "subscription.window.daily": "Daily", "subscription.window.weekly": "Weekly", "subscription.window.monthly": "Monthly", "subscription.window.quota": "Total quota", "subscription.window.mcp": "Monthly MCP quota", "subscription.used": "{value}% used", "subscription.resetsIn": "Resets in {time}", "subscription.resetDue": "Reset pending", "subscription.notConfigured": "Configure {refs} to show live subscription usage.", "subscription.unauthorized": "The credential has expired; update it and retry.", "subscription.rateLimited": "The provider is rate limiting checks; retry later.", "subscription.unavailable": "The provider returned no recognizable quota windows.", "subscription.planUnknown": "Subscription plan",
			"usage.history": "Usage details & history", "usage.activity": "Token activity", "usage.activityRange": "About the last 12 months", "usage.today": "Today", "usage.month": "This month", "usage.total": "All time", "usage.loading": "Aggregating usage…", "usage.error": "Usage aggregation failed: {message}", "usage.bucket.daily": "Daily", "usage.bucket.weekly": "Weekly", "usage.bucket.total": "Total", "usage.legendLess": "Less", "usage.legendMore": "More", "usage.back": "Back", "usage.hitRate": "Cache hit", "usage.hit.today": "Today's cache hit", "usage.input": "Input", "usage.output": "Output", "usage.cacheRead": "Cache read", "usage.unknownModel": "Unknown model", "usage.noModels": "No per-model data for this day.",
			"credential.title": "Credentials", "credential.configured": "Configured", "credential.missing": "Not configured", "credential.configure": "Configure API Key", "credential.update": "Update API Key", "credential.save": "Save", "credential.import": "Import from local file", "credential.oauth": "OAuth login", "credential.clear": "Clear credential", "credential.keyHint": "The key is stored securely in ~/.dsh/.credentials.yaml and never sent to the browser. Ref: {ref}", "credential.fileNotFound": "Local credential file not found", "credential.noTokenInFile": "No valid token found in local file", "credential.oauthInstruction": "Run the CLI login command in your terminal to complete authorization, then use \"Import from local file\" to sync credentials.",
			"prefs.allHidden": "All providers are hidden. Restore them in Settings → Usage Stats.",
			"settings.nav": "Usage Stats", "settings.title": "Usage Stats", "settings.intro": "Configure provider credentials, list visibility, and display defaults; the popup focuses on quota display.", "settings.serverRestartHint": "Some configuration features require a dsh web restart to take effect.", "settings.visibility": "Provider visibility", "settings.visibilityNote": "Hidden providers keep refreshing in the background; they just don't appear in the popup list.", "settings.credentials": "Credentials", "settings.displayDefaults": "Display defaults", "settings.density": "List density", "settings.historyMode": "Default heatmap mode", "settings.debug": "Debug logging", "settings.debugLabel": "Debug logging toggle", "settings.debugNote": "When enabled, diagnostic logs prefixed [usg] are printed to the browser console.",
			"action.show": "Show", "action.hide": "Hide",
			"action.refresh": "Refresh", "action.retry": "Retry", "action.close": "Close", "weekday.mon": "M", "weekday.tue": "T", "weekday.wed": "W", "weekday.thu": "T", "weekday.fri": "F", "weekday.sat": "S", "weekday.sun": "S", "month.names": "Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec"
		};
		//#endregion

		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "usage-stats: dictionaries");
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({ name: "sidebar.footer.action", id: "usage-stats", locale: NS, order: 10 }, UsageStatsPanel));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "usage-stats",
				order: 80,
				label: () => ctx.locale.bind(NS)("settings.nav"),
				locale: NS
			}, UsageStatsSettingsSection));
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.setDebug = setDebug;
		exports.dbg = dbg;
		exports.UsageStatsPanel = UsageStatsPanel;
		exports.PanelErrorBoundary = PanelErrorBoundary;
		exports.UsageStatsSettingsSection = UsageStatsSettingsSection;
		exports.SettingsSectionContent = SettingsSectionContent;
		exports.AccountList = AccountList;
		exports.AccountDetailPane = AccountDetailPane;
		exports.ProviderAccountCard = ProviderAccountCard;
		exports.ActivityHeatmap = ActivityHeatmap;
		exports.DayDetail = DayDetail;
		exports.buildActivityHeatmap = buildActivityHeatmap;
		exports.cellColor = cellColor;
		exports.createLoader = createLoader;
		exports.dismissAction = dismissAction;
		exports.buildProviderChoices = buildProviderChoices;
		exports.modelLabelOf = modelLabelOf;
		exports.fmt = fmt;
		exports.fmtCurrency = fmtCurrency;
		exports.resetRelativeLabel = resetRelativeLabel;
		return module.exports;
	}
});

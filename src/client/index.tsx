import type {} from "@deepseek-ai/dsh-client-locale/client";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import uplotStyles from "uplot/dist/uPlot.min.css";
import { usageUiController } from "./controller.js";
import { DshClientAdapter } from "./DshClientAdapter.js";
import { en, LOCALE_NAMESPACE, type UsageLocaleKey, zh } from "./locales.js";
import { installStyle } from "./style.js";
import styles from "./styles.css";

export const inject = ["locale"];

declare module "@deepseek-ai/dsh-client-ui-slots" {
	interface LocaleNamespaceMap {
		"usage-stats": UsageLocaleKey;
	}
}

export function apply(ctx: ClientContext): void {
	ctx.effect(() => installStyle(`${uplotStyles}\n${styles}`), "usage-stats: styles");
	ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }), "usage-stats: dictionaries");
	ctx.effect(() => {
		const openDashboard = (): void => usageUiController.openDashboard();
		window.addEventListener("usage-stats:open-dashboard", openDashboard);
		return () => window.removeEventListener("usage-stats:open-dashboard", openDashboard);
	}, "usage-stats: shared coding OAuth entry");

	new DshClientAdapter().install(ctx);
}

export { DshClientAdapter } from "./DshClientAdapter.js";

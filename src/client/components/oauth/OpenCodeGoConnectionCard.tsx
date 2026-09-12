import {
	useCodingOAuthStatusQuery,
	useOpenCodeGoApplyMutation,
	useOpenCodeGoConnectionQuery,
	useOpenCodeGoCredentialMutation,
	useOpenCodeGoModelsMutation,
} from "../../coding-oauth-api.js";
import type { Translate } from "../../locales.js";
import { OpenCodeGoConnectionView } from "./OpenCodeGoConnectionView.js";
export function OpenCodeGoConnectionCard({
	t,
	onStartConversation,
}: {
	readonly t: Translate;
	readonly onStartConversation: () => void;
}) {
	const status = useOpenCodeGoConnectionQuery();
	const runtime = useCodingOAuthStatusQuery();
	const credential = useOpenCodeGoCredentialMutation();
	const directory = useOpenCodeGoModelsMutation();
	const apply = useOpenCodeGoApplyMutation();
	const fromRuntime = runtime.data?.opencodeGo;
	const call =
		fromRuntime && (fromRuntime.updatedAt ?? 0) >= (status.data?.call.updatedAt ?? 0) ? fromRuntime : status.data?.call;
	return (
		<OpenCodeGoConnectionView
			status={status.data}
			{...(call ? { call } : {})}
			{...(status.error instanceof Error ? { loadError: status.error.message } : {})}
			t={(key, params) => t(`oauth.opencodeGo.${key}`, params)}
			onReload={async () => (await status.refetch()).data}
			onSaveCredential={(input) => credential.mutateAsync(input)}
			onLoadModels={(ref) => directory.mutateAsync(ref)}
			onApply={(input) => apply.mutateAsync(input)}
			onStartConversation={onStartConversation}
		/>
	);
}

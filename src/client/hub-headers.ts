/** Shared Hub CSRF / authority headers for Usage APIs and coding-OAuth routes. */
export function hubApiHeaders(url: string, write: boolean, initial: HeadersInit | undefined): Headers {
	const headers = new Headers(initial);
	headers.set("x-dsh-hub-oauth-gateway", "1");
	let authority = "";
	if (typeof window !== "undefined") {
		try {
			const target = new URL(url, window.location.href);
			if (target.origin === window.location.origin) authority = target.host;
		} catch {
			// Leave the corroboration header absent if the target cannot be resolved safely.
		}
	}
	if (authority === "") headers.delete("x-dsh-hub-oauth-gateway-authority");
	else headers.set("x-dsh-hub-oauth-gateway-authority", authority);
	if (write) headers.set("content-type", "application/json");
	return headers;
}

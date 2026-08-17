const STYLE_ID = "dsh-hub-oauth-gateway-v1";

export function installStyle(css: string): () => void {
	const existing = document.querySelector<HTMLStyleElement>(`style[data-plugin="${STYLE_ID}"]`);
	if (existing !== null) return () => undefined;
	const style = document.createElement("style");
	style.dataset.plugin = STYLE_ID;
	style.textContent = css;
	document.head.append(style);
	return () => style.remove();
}

/**
 * OpenCode Go subscription adapter.
 *
 * OpenCode Go's documented provider API does not include usage, but its
 * first-party client exposes an undocumented Bearer-key endpoint. The adapter
 * prefers that simpler path, can reuse OpenCode's local auth.json, and keeps
 * the authenticated workspace dashboard as a compatibility fallback.
 */
import type { AccountAdapter } from "../types.js";
export declare const OPENCODE_GO_API_KEY_REF = "OPENCODE_GO_API_KEY";
/** OpenCode Go: Bearer usage endpoint with workspace-dashboard fallback. */
export declare const openCodeGoAdapter: AccountAdapter;
export declare const OPENCODE_GO_DISPLAY_NAME = "OpenCode Go";
//# sourceMappingURL=opencode-go.d.ts.map
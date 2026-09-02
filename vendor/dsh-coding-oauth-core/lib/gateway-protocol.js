/**
 * Shared request/stream types for the local coding-subscription gateway.
 * @module dsh-coding-oauth-core/gateway-protocol
 */
export function isThinkingLevel(value) {
    return (value === "off" ||
        value === "minimal" ||
        value === "low" ||
        value === "medium" ||
        value === "high" ||
        value === "xhigh" ||
        value === "max");
}
//# sourceMappingURL=gateway-protocol.js.map
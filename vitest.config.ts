import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/v1/**/*.test.{ts,tsx}"],
		environment: "node",
		coverage: {
			provider: "v8",
			reporter: ["text", "json-summary"],
			include: [
				"src/server/coding-oauth/web-origin.ts",
				"src/server/coding-oauth/authorize-request.ts",
				"src/server/coding-oauth/gateway-routes.ts",
			],
			// Advisory floors for security-critical modules (aggregate over include).
			// Measured green baseline ~88% statements / ~85% branches / ~90% lines.
			thresholds: {
				statements: 80,
				branches: 80,
				functions: 90,
				lines: 85,
			},
		},
	},
});

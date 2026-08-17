import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/v1/**/*.test.{ts,tsx}"],
		environment: "node",
		coverage: {
			provider: "v8",
			reporter: ["text", "json-summary"],
			include: ["src/shared/**/*.ts", "src/server/**/*.ts", "src/client/**/*.ts", "src/client/**/*.tsx"],
		},
	},
});

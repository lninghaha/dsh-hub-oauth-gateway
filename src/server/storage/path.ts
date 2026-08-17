import { homedir } from "node:os";
import { join } from "node:path";

export function usageDatabasePath(environment: NodeJS.ProcessEnv = process.env): string {
	const home = environment.DSH_HOME ?? join(homedir(), ".dsh");
	return join(home, "storages", "usage-stats-v1.sqlite");
}

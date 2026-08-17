import { type AccountSnapshot, AccountSnapshotSchema, type QuotaWindow } from "../../shared/domain.js";
import type { UsageDatabase } from "../storage/database.js";

interface AccountRow {
	id: number;
	provider_id: string;
	display_name: string;
	adapter_id: string | null;
	observed_at: number;
	status: AccountSnapshot["status"];
	mode: AccountSnapshot["mode"];
	configured: 0 | 1;
	stale: 0 | 1;
	plan: string | null;
	balance_json: string | null;
	missing_credentials_json: string;
	warning_code: string | null;
}

interface WindowRow {
	account_snapshot_id: number;
	window_id: string;
	kind: QuotaWindow["kind"];
	label: string;
	unit: QuotaWindow["unit"];
	used: number | null;
	remaining: number | null;
	quota_limit: number | null;
	used_ratio: number | null;
	resets_at: number | null;
	rolling: 0 | 1;
}

function windowFromRow(row: WindowRow): QuotaWindow {
	return {
		id: row.window_id,
		kind: row.kind,
		label: row.label,
		unit: row.unit,
		used: row.used,
		remaining: row.remaining,
		limit: row.quota_limit,
		usedRatio: row.used_ratio,
		resetsAt: row.resets_at,
		rolling: row.rolling === 1,
	};
}

export class AccountSnapshotRepository {
	readonly #database: UsageDatabase;

	constructor(database: UsageDatabase) {
		this.#database = database;
	}

	save(snapshot: AccountSnapshot, observedAt = Date.now()): AccountSnapshot {
		const value = AccountSnapshotSchema.parse(snapshot);
		const timestamp = value.fetchedAt ?? observedAt;
		this.#database.transaction(() => {
			const result = this.#database
				.prepare(`
					INSERT INTO account_snapshots (
						provider_id, display_name, adapter_id, observed_at, status, mode, configured, stale,
						plan, balance_json, missing_credentials_json, warning_code
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`)
				.run(
					value.providerId,
					value.displayName,
					value.adapterId,
					timestamp,
					value.status,
					value.mode,
					value.configured ? 1 : 0,
					value.stale ? 1 : 0,
					value.plan,
					value.balance === null ? null : JSON.stringify(value.balance),
					JSON.stringify(value.missingCredentials),
					value.warningCode,
				);
			const snapshotId = Number(result.lastInsertRowid);
			const insertWindow = this.#database.prepare(`
				INSERT INTO quota_window_snapshots (
					account_snapshot_id, window_id, kind, label, unit, used, remaining,
					quota_limit, used_ratio, resets_at, rolling
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);
			for (const window of value.windows) {
				insertWindow.run(
					snapshotId,
					window.id,
					window.kind,
					window.label,
					window.unit,
					window.used,
					window.remaining,
					window.limit,
					window.usedRatio,
					window.resetsAt,
					window.rolling ? 1 : 0,
				);
			}
		});
		return { ...value, fetchedAt: timestamp };
	}

	saveMany(snapshots: readonly AccountSnapshot[], observedAt = Date.now()): AccountSnapshot[] {
		return snapshots.map((snapshot) => this.save(snapshot, observedAt));
	}

	latest(providerId: string): AccountSnapshot | null {
		const row = this.#database
			.prepare(`
				SELECT id, provider_id, display_name, adapter_id, observed_at, status, mode, configured, stale,
				plan, balance_json, missing_credentials_json, warning_code
				FROM account_snapshots
				WHERE provider_id = ?
				ORDER BY observed_at DESC, id DESC
				LIMIT 1
			`)
			.get(providerId) as AccountRow | undefined;
		return row === undefined ? null : this.#hydrate(row);
	}

	latestAll(): AccountSnapshot[] {
		const rows = this.#database
			.prepare(`
				SELECT a.id, a.provider_id, a.display_name, a.adapter_id, a.observed_at, a.status, a.mode,
				a.configured, a.stale, a.plan, a.balance_json, a.missing_credentials_json, a.warning_code
				FROM account_snapshots a
				WHERE a.id = (
					SELECT b.id FROM account_snapshots b
					WHERE b.provider_id = a.provider_id
					ORDER BY b.observed_at DESC, b.id DESC LIMIT 1
				)
				ORDER BY a.provider_id
			`)
			.all() as unknown as AccountRow[];
		return rows.map((row) => this.#hydrate(row));
	}

	pruneBefore(cutoff: number): number {
		const result = this.#database.prepare("DELETE FROM account_snapshots WHERE observed_at < ?").run(cutoff);
		return Number(result.changes);
	}

	#hydrate(row: AccountRow): AccountSnapshot {
		const windows = this.#database
			.prepare(`
				SELECT account_snapshot_id, window_id, kind, label, unit, used, remaining,
				quota_limit, used_ratio, resets_at, rolling
				FROM quota_window_snapshots WHERE account_snapshot_id = ? ORDER BY window_id
			`)
			.all(row.id) as unknown as WindowRow[];
		return AccountSnapshotSchema.parse({
			providerId: row.provider_id,
			displayName: row.display_name,
			adapterId: row.adapter_id,
			mode: row.mode,
			status: row.status,
			configured: row.configured === 1,
			fetchedAt: row.observed_at,
			stale: row.stale === 1,
			plan: row.plan,
			balance: row.balance_json === null ? null : JSON.parse(row.balance_json),
			windows: windows.map(windowFromRow),
			missingCredentials: JSON.parse(row.missing_credentials_json),
			warningCode: row.warning_code,
		});
	}
}

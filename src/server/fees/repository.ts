import { type AccountFeeRecord, AccountFeeRecordSchema, type FeesData } from "../../shared/fees.js";
import type { UsageDatabase } from "../storage/database.js";

interface FeeRow {
	id: string;
	provider_id: string;
	account_label: string | null;
	kind: AccountFeeRecord["kind"];
	plan_name: string | null;
	amount: number;
	currency: string;
	interval: AccountFeeRecord["interval"];
	anchor_date: string | null;
	next_renewal_date: string | null;
	topups_json: string;
	notes: string | null;
	updated_at: number;
}

function fromRow(row: FeeRow): AccountFeeRecord {
	return AccountFeeRecordSchema.parse({
		id: row.id,
		providerId: row.provider_id,
		accountLabel: row.account_label,
		kind: row.kind,
		planName: row.plan_name,
		amount: row.amount,
		currency: row.currency,
		interval: row.interval,
		anchorDate: row.anchor_date,
		nextRenewalDate: row.next_renewal_date,
		topups: JSON.parse(row.topups_json) as unknown,
		notes: row.notes,
		updatedAt: row.updated_at,
	});
}

export class FeesRepository {
	readonly #database: UsageDatabase;

	constructor(database: UsageDatabase) {
		this.#database = database;
	}

	list(): AccountFeeRecord[] {
		const rows = this.#database
			.prepare(`
				SELECT id, provider_id, account_label, kind, plan_name, amount, currency, interval,
					anchor_date, next_renewal_date, topups_json, notes, updated_at
				FROM account_fees
				ORDER BY provider_id, kind, id
			`)
			.all() as unknown as FeeRow[];
		return rows.map(fromRow);
	}

	replaceAll(fees: readonly AccountFeeRecord[], updatedAt = Date.now()): FeesData {
		const values = fees.map((fee) =>
			AccountFeeRecordSchema.parse({
				...fee,
				updatedAt: fee.updatedAt > 0 ? fee.updatedAt : updatedAt,
			}),
		);
		this.#database.transaction(() => {
			this.#database.prepare("DELETE FROM account_fees").run();
			const insert = this.#database.prepare(`
				INSERT INTO account_fees (
					id, provider_id, account_label, kind, plan_name, amount, currency, interval,
					anchor_date, next_renewal_date, topups_json, notes, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);
			for (const fee of values) {
				insert.run(
					fee.id,
					fee.providerId,
					fee.accountLabel,
					fee.kind,
					fee.planName,
					fee.amount,
					fee.currency,
					fee.interval,
					fee.anchorDate,
					fee.nextRenewalDate,
					JSON.stringify(fee.topups),
					fee.notes,
					fee.updatedAt,
				);
			}
		});
		return { fees: values };
	}
}

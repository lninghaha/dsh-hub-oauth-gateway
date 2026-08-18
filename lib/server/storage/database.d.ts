export declare class UsageDatabase {
    #private;
    private constructor();
    static open(path: string): Promise<UsageDatabase>;
    prepare(sql: string): import("node:sqlite").StatementSync;
    exec(sql: string): void;
    transaction<T>(operation: () => T): T;
    close(): void;
}
export declare const USAGE_DATABASE_SCHEMA_VERSION = 2;
//# sourceMappingURL=database.d.ts.map
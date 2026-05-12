/**
 * MySQL database backup via DATABASE_URL (no mysqldump required).
 * Connects with mysql2 and dumps all tables to a .sql file.
 *
 * Usage: npm run db:backup
 */

import * as fs from "fs";
import * as path from "path";
import { config } from "dotenv";
import mysql from "mysql2/promise";

config();

const DATABASE_URL: string = process.env.DATABASE_URL ?? "";
if (!DATABASE_URL || !DATABASE_URL.startsWith("mysql")) {
  console.error("DATABASE_URL (MySQL) not set in .env");
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = path.join(process.cwd(), "backups");
const outFile = path.join(outDir, `threads_${timestamp}.sql`);

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function escapeSql(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "1" : "0";
  if (val instanceof Date) return "'" + val.toISOString().slice(0, 19).replace("T", " ") + "'";
  const s = String(val);
  return "'" + s.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/\n/g, "\\n").replace(/\r/g, "\\r") + "'";
}

async function main() {
  console.log(`Connecting via DATABASE_URL and backing up to ${outFile}`);

  const conn = await mysql.createConnection(DATABASE_URL);
  const lines: string[] = [];

  lines.push("-- MySQL backup via Node (mysql2)");
  lines.push(`-- ${new Date().toISOString()}`);
  lines.push("SET FOREIGN_KEY_CHECKS=0;");
  lines.push("");

  const [tableRows] = (await conn.query(
    "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME"
  )) as unknown as [Array<{ name?: string; TABLE_NAME?: string }>];

  const tables = tableRows.map((r) => r.name ?? r.TABLE_NAME).filter(Boolean) as string[];
  console.log(`Found ${tables.length} tables`);

  for (const table of tables) {
    const [createRows] = (await conn.query(`SHOW CREATE TABLE \`${table}\``)) as unknown as [Array<{ "Create Table"?: string }>];
    const createSql = createRows[0]?.["Create Table"];
    if (createSql) {
      lines.push(`DROP TABLE IF EXISTS \`${table}\`;`);
      lines.push(createSql + ";");
      lines.push("");
    }

    const [rows] = (await conn.query({ sql: `SELECT * FROM \`${table}\``, rowsAsArray: true })) as unknown as [unknown[][]];
    const [colRows] = (await conn.query(`SHOW COLUMNS FROM \`${table}\``)) as unknown as [Array<{ Field: string }>];
    const columns = colRows.map((c) => c.Field);

    if (Array.isArray(rows) && rows.length > 0) {
      const rowArrays = rows;
      const batchSize = 100;
      for (let i = 0; i < rowArrays.length; i += batchSize) {
        const batch = rowArrays.slice(i, i + batchSize);
        const values = batch
          .map((row) => "(" + (row as unknown[]).map(escapeSql).join(",") + ")")
          .join(",\n  ");
        const colList = columns.map((c) => "`" + c + "`").join(", ");
        lines.push(`INSERT INTO \`${table}\` (${colList}) VALUES`);
        lines.push("  " + values + ";");
        lines.push("");
      }
    }
  }

  lines.push("SET FOREIGN_KEY_CHECKS=1;");
  lines.push("");

  await conn.end();

  fs.writeFileSync(outFile, lines.join("\n"), "utf8");
  console.log(`Done. Backup saved to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

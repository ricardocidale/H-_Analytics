/**
 * Stats — codebase metrics in <5s. No vitest, no tsc.
 * File counts, line counts, test counts via rg.
 * Use `npm run lint:summary` for TypeScript checking.
 *
 * Usage: npm run stats
 */
import { join } from "path";
import { countFiles, countTestsFromFiles } from "./lib/runners.js";

const root = process.cwd();

const client = countFiles(join(root, "client/src"), [".ts", ".tsx"]);
const server = countFiles(join(root, "server"), [".ts"]);
const calc = countFiles(join(root, "calc"), [".ts"]);
const shared = countFiles(join(root, "shared"), [".ts"]);
const tests = countFiles(join(root, "tests"), [".ts"]);

const { testCount, fileCount: testFileCount } = countTestsFromFiles();

const skills = countFiles(join(root, ".claude/skills"), [".md"]);
const rules = countFiles(join(root, ".claude/rules"), [".md"]);
const tools = countFiles(join(root, ".claude/tools"), [".md", ".ts", ".json"]);

console.log("");
console.log("  Codebase Stats");
console.log("  " + "─".repeat(44));
console.log(`  Source        ${(client.files + server.files + calc.files + shared.files).toString().padStart(5)} files   ${(client.lines + server.lines + calc.lines + shared.lines).toLocaleString().padStart(7)} lines`);
console.log(`    client/     ${client.files.toString().padStart(5)} files   ${client.lines.toLocaleString().padStart(7)} lines`);
console.log(`    server/     ${server.files.toString().padStart(5)} files   ${server.lines.toLocaleString().padStart(7)} lines`);
console.log(`    calc/       ${calc.files.toString().padStart(5)} files   ${calc.lines.toLocaleString().padStart(7)} lines`);
console.log(`    shared/     ${shared.files.toString().padStart(5)} files   ${shared.lines.toLocaleString().padStart(7)} lines`);
console.log(`  Tests         ${tests.files.toString().padStart(5)} files   ${tests.lines.toLocaleString().padStart(7)} lines   (~${testCount} tests in ${testFileCount} files)`);
console.log(`  Skills        ${skills.files.toString().padStart(5)} files`);
console.log(`  Rules         ${rules.files.toString().padStart(5)} files`);
console.log(`  Tools         ${tools.files.toString().padStart(5)} files`);
console.log("  " + "─".repeat(44));
console.log("");

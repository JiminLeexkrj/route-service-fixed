import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const terminal = createInterface({ input: process.stdin, output: process.stdout });
try {
  console.log("TMAP setup: use the appKey from SK open API with the Public Transit API enabled.");
  const key = (await terminal.question("Paste TMAP appKey, then press Enter: ")).trim();
  if (!/^[A-Za-z0-9._~+/=-]{8,256}$/.test(key)) throw new Error("Invalid appKey format. Copy only the key value.");
  const target = fileURLToPath(new URL("../.env.local", import.meta.url));
  let contents = await readFile(target, "utf8").catch(() => "");
  const line = `TMAP_APP_KEY=${key}`;
  contents = /^TMAP_APP_KEY=.*$/m.test(contents) ? contents.replace(/^TMAP_APP_KEY=.*$/m, () => line) : `${contents.trimEnd()}\n${line}\n`;
  await writeFile(target, contents, { mode: 0o600 });
  console.log("Saved. Close the old server with Ctrl+C, then run START-WINDOWS.cmd.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Setup failed.");
  process.exitCode = 1;
} finally { terminal.close(); }

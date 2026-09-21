// Builds the sanitized package from a clean dist/ and installs it globally.
// Owns the whole deploy (clean -> build -> pack -> install) so the cleanup
// cannot be skipped by invoking the builds separately.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", ...opts });

// Wipe dist/ before building. package.json ships `files: ["dist", ...]`, i.e.
// the whole folder, and nothing else cleans it — so stale output from an
// earlier full `npm run build` gets packed too. That included dist/cloudflare/
// with the worker and BOTH cloud-websocket relay modules: dead code (bin is
// dist/local.js and nothing imports cloudflare/), but a local-only package has
// no business shipping the relay we removed from the plugin.
console.log("Cleaning dist/ ...");
rmSync("dist", { recursive: true, force: true });

run("npm run build:local");
run("npm run build:apps");

const packOutput = execSync("npm pack --ignore-scripts", { encoding: "utf8" });
const tarball = packOutput.trim().split("\n").pop().trim();

console.log(`\nInstalling ${tarball} globally...`);
// --prefer-offline: use cached package metadata without revalidating against
// the registry — the corporate Nexus is VPN-only and npm hangs ~70s/package
// on DNS retries when it's unreachable. Only genuinely missing packages hit
// the network. Fail fast (not endless backoff) if one does and Nexus is down.
run(`npm install -g --prefer-offline --fetch-retries=1 --fetch-timeout=30000 "${tarball}"`);
rmSync(tarball);

run("npm ls -g @ei/figma-console-mcp");
console.log("\nDone. MCP configs can use command: figma-console-mcp");

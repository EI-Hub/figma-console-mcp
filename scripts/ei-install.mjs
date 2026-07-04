// Packs the sanitized build into a tarball and installs it globally.
// A tarball install (vs `npm i -g .`) gives a real copy decoupled from this
// checkout — folder installs symlink to the working tree.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", ...opts });

const packOutput = execSync("npm pack --ignore-scripts", { encoding: "utf8" });
const tarball = packOutput.trim().split("\n").pop().trim();

console.log(`\nInstalling ${tarball} globally...`);
run(`npm install -g "${tarball}"`);
rmSync(tarball);

run("npm ls -g @ei/figma-console-mcp");
console.log("\nDone. MCP configs can use command: figma-console-mcp");

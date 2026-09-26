import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { ROOT } from "./fixture.js";

/** The CLI cases run the published npm scripts, and those run the build. */
export default function setup(): void {
  execFileSync(join(ROOT, "node_modules/.bin/tsc"), { cwd: ROOT, stdio: "inherit" });
}

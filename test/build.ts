import { execFileSync } from "node:child_process";
import { ROOT } from "./fixture.js";

/** The CLI cases run the published npm scripts, and those run the build. */
export default function setup(): void {
  execFileSync("npm", ["run", "--silent", "build"], { cwd: ROOT, stdio: "inherit" });
}

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PROMPT_DIR = new URL("../../prompts/", import.meta.url);

/** Loads prompt .md files and fills {{placeholders}}. Prompts never live inline in code. */
export class PromptLoader {
  private readonly cache = new Map<string, string>();

  render(file: string, vars: Record<string, string> = {}): string {
    let template = this.cache.get(file);
    if (template === undefined) {
      template = readFileSync(fileURLToPath(new URL(file, PROMPT_DIR)), "utf8");
      this.cache.set(file, template);
    }
    return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
  }
}

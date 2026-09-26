import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { AuthorPending, NamingError, UnreadableAnswer } from "../errors.js";
import { reason } from "../json.js";
import { PromptLoader } from "../prompts/loader.js";
import type { ChatModel, ChatRequest } from "./model.js";

const REQUESTS = "requests";
const STALE = "stale";

/** An external author in the model's place, through a folder laid out like Quests' external
 *  author: the run writes each request to `requests/<key>.md`, the author answers it in
 *  `<key>.json`. A request without an answer stops the run with AuthorPending; a rerun reads
 *  each answer back by key, so a run resumes where it stopped. Answers go through the passes'
 *  own parsers and repair rounds, like a model's. */
export class AuthorDir implements ChatModel {
  readonly dir: string;
  private readonly prompts = new PromptLoader();

  /** `id` names the author in the outputs' meta. */
  constructor(dir: string, readonly id = "author") {
    this.dir = resolve(dir);
  }

  /** An answer stands while its request file carries the fingerprint of the same basis and
   *  schema; one without a request file is adopted, and its request written. An answer for
   *  another fingerprint was written for another theme, world or earlier answer, so it is set
   *  aside under `stale/` and its request written again. */
  async completeJSON(request: ChatRequest): Promise<unknown> {
    const fingerprint = createHash("sha256").update(request.basis).update("\n").update(JSON.stringify(request.schema)).digest("hex").slice(0, 16);
    const answer = join(this.dir, `${request.key}.json`);
    const file = join(this.dir, REQUESTS, `${request.key}.md`);
    const asked = existsSync(file) ? fingerprintOf(readText(file)) : undefined;
    let answered = existsSync(answer);
    if (answered && asked === fingerprint) return readAnswer(answer);
    if (answered && asked !== undefined) {
      this.setAside(request.key, answer);
      answered = false;
    }
    this.write(file, this.prompts.render("author/request.md", {
      key: request.key,
      fingerprint,
      system: request.system.trim(),
      user: request.user.trim(),
      schema: JSON.stringify(request.schema),
    }));
    if (answered) return readAnswer(answer);
    throw new AuthorPending(this.dir, [file]);
  }

  /** Moves an answer to `stale/<key>.<n>.json` under the first free number, so no answer the
   *  author wrote is ever overwritten. */
  private setAside(key: string, answer: string): void {
    let n = 1;
    while (existsSync(join(this.dir, STALE, `${key}.${n}.json`))) n++;
    const target = join(this.dir, STALE, `${key}.${n}.json`);
    guard(target, () => {
      mkdirSync(join(this.dir, STALE), { recursive: true });
      renameSync(answer, target);
    });
  }

  private write(path: string, text: string): void {
    guard(path, () => {
      mkdirSync(join(this.dir, REQUESTS), { recursive: true });
      writeFileSync(path, text);
    });
  }
}

/** The fingerprint a request file was written with, from its header; undefined when it has none. */
function fingerprintOf(request: string): string | undefined {
  return /^Basis: ([0-9a-f]+)$/m.exec(request.slice(0, request.indexOf("========")))?.[1];
}

function guard(path: string, action: () => void): void {
  try {
    action();
  } catch (error) {
    throw new NamingError("INVALID_PARAMS", `cannot write to the author dir at ${path}: ${reason(error)}`, error);
  }
}

function readText(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new NamingError("INVALID_PARAMS", `cannot read ${path}: ${reason(error)}`, error);
  }
}

/** The author's answer as JSON, tolerating a fenced code block around it. */
function readAnswer(path: string): unknown {
  const text = readText(path);
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text.trim());
  try {
    return JSON.parse(fenced ? fenced[1] : text);
  } catch (error) {
    throw new UnreadableAnswer(`${path} is not valid JSON: ${reason(error)}`);
  }
}

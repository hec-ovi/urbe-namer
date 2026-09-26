import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { AuthorPending, NamingError, UnreadableAnswer } from "../errors.js";
import { reason } from "../json.js";
import { PromptLoader } from "../prompts/loader.js";
import type { ChatModel, ChatRequest } from "./model.js";

/** An external author in the model's place, through a folder: every request of a run is
 *  `<key>.md`, and its answer is `<key>.json` beside it, written by the author. A request
 *  without an answer is written out and stops the run with AuthorPending; a rerun reads each
 *  answer back by key, so a run resumes where it stopped. Answers go through the passes'
 *  own parsers and repair rounds, like a model's. */
export class AuthorDir implements ChatModel {
  readonly dir: string;
  private readonly prompts = new PromptLoader();

  /** `id` names the author in the outputs' meta. */
  constructor(dir: string, readonly id = "author") {
    this.dir = resolve(dir);
  }

  async completeJSON(request: ChatRequest): Promise<unknown> {
    const answer = this.path(request.key, "json");
    const fingerprint = createHash("sha256").update(JSON.stringify(request.schema)).digest("hex").slice(0, 16);
    if (existsSync(answer)) {
      const asked = this.askedFor(request.key);
      if (asked === undefined || asked === fingerprint) return readAnswer(answer);
      this.write(() => renameSync(answer, this.path(request.key, "stale.json")), answer);
    }
    const file = this.path(request.key, "md");
    this.write(() => {
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(file, this.prompts.render("author/request.md", {
        fingerprint,
        key: request.key,
        system: request.system.trim(),
        user: request.user.trim(),
        schema: JSON.stringify(request.schema),
      }));
    }, file);
    throw new AuthorPending(this.dir, [file]);
  }

  /** The schema fingerprint of the request an answer was written for; undefined when its
   *  request file is gone, which leaves the answer standing. A different fingerprint means the
   *  answer was for an earlier request under the same key (other ids, other district names),
   *  so it is set aside as `<key>.stale.json` and the request is written again. */
  private askedFor(key: string): string | undefined {
    const file = this.path(key, "md");
    return existsSync(file) ? /^<!-- schema ([0-9a-f]+) -->/.exec(readText(file))?.[1] : undefined;
  }

  private path(key: string, extension: string): string {
    return join(this.dir, `${key}.${extension}`);
  }

  private write(action: () => void, path: string): void {
    try {
      action();
    } catch (error) {
      throw new NamingError("INVALID_PARAMS", `cannot write to the author dir at ${path}: ${reason(error)}`, error);
    }
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

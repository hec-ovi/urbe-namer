import type { ChatModel } from "../llm/model.js";
import type { Business, NamedWorld, NpcTypeSet, RunParams } from "../types.js";
import { exportBusinesses } from "../export/businesses.js";
import { NamingPass } from "../passes/naming.js";
import { TypingPass, type PopulationStats } from "../passes/typing.js";
import type { Progress } from "../progress.js";
import type { WorldFolder } from "./folder.js";

export interface WorldRun {
  named: NamedWorld;
  types: NpcTypeSet;
  businesses: Business[];
}

export interface WorldOptions {
  /** receives one line per finished step of both passes */
  progress?: Progress;
}

/** The whole chain over one world folder: naming, typing, businesses, each written to
 *  disk as soon as it exists, so a failure later in the chain keeps what came before. */
export class WorldPipeline {
  constructor(
    private readonly model: ChatModel,
    private readonly options: WorldOptions = {},
  ) {}

  async run(folder: WorldFolder, params: RunParams, stats?: PopulationStats): Promise<WorldRun> {
    const named = await new NamingPass(this.model, this.options).run(folder.readBlueprint(), params);
    folder.write("named", named);
    const types = await new TypingPass(this.model, this.options).run(named, params, stats);
    folder.write("npcTypes", types);
    const businesses = exportBusinesses(named);
    folder.write("businesses", businesses);
    return { named, types, businesses };
  }
}

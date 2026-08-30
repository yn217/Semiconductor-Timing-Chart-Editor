import { CommandHistorySession } from "@timing-chart-v2/history";
import type { CanonicalDocument } from "@timing-chart-v2/schema";

/** Owns the replaceable document session lifecycle for the editor runtime. */
export class EditorSessionController {
  private session: CommandHistorySession;

  constructor(document: CanonicalDocument) {
    this.session = new CommandHistorySession(document);
  }

  current(): CommandHistorySession {
    return this.session;
  }

  snapshot(): ReturnType<CommandHistorySession["getSnapshot"]> {
    return this.session.getSnapshot();
  }

  replace(document: CanonicalDocument): CommandHistorySession {
    this.session = new CommandHistorySession(document);
    return this.session;
  }

  execute(command: Parameters<CommandHistorySession["execute"]>[0]): ReturnType<CommandHistorySession["execute"]> {
    return this.session.execute(command);
  }

  executeBatch(id: Parameters<CommandHistorySession["executeBatch"]>[0], commands: Parameters<CommandHistorySession["executeBatch"]>[1]): ReturnType<CommandHistorySession["executeBatch"]> {
    return this.session.executeBatch(id, commands);
  }

  undo(): ReturnType<CommandHistorySession["undo"]> {
    return this.session.undo();
  }

  redo(): ReturnType<CommandHistorySession["redo"]> {
    return this.session.redo();
  }
}

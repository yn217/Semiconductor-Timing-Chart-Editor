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

  replace(document: CanonicalDocument): CommandHistorySession {
    this.session = new CommandHistorySession(document);
    return this.session;
  }
}

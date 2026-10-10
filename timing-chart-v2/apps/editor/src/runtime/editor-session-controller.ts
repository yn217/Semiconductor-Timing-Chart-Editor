import { CommandHistorySession, ScenarioCommandHistorySession } from "@timing-chart-v2/history";
import { setReservedEntityIdSource } from "../entity-id.js";
import { serializeScenarioDocumentModel, serializeValidatedCanonicalDocument, type CanonicalDocument, type ParsedCanonicalDocument, type ScenarioDocumentModel, type ScenarioId } from "@timing-chart-v2/schema";

export type ActiveEditorSession = CommandHistorySession | ScenarioCommandHistorySession;

/** Owns the replaceable document session lifecycle for the editor runtime. */
export class EditorSessionController {
  private session: ActiveEditorSession;
  private activeProjectionGeneration = 0;

  constructor(document: CanonicalDocument) {
    this.session = new CommandHistorySession(document);
    setReservedEntityIdSource(undefined);
  }

  current(): ActiveEditorSession {
    return this.session;
  }

  snapshot(): ReturnType<CommandHistorySession["getSnapshot"]> {
    return this.session.getSnapshot();
  }

  /** Presentation context identity, independent of persisted revision and document lifetime. */
  projectionGeneration(): number {
    return this.activeProjectionGeneration;
  }

  private trackProjectionContext<T>(operation: () => T): T {
    const session = this.session;
    const scenarioId = this.activeScenarioId();
    try {
      return operation();
    } finally {
      if (session !== this.session || scenarioId !== this.activeScenarioId()) this.activeProjectionGeneration += 1;
    }
  }

  replace(document: CanonicalDocument | ParsedCanonicalDocument): CommandHistorySession {
    return this.trackProjectionContext(() => {
      const session = new CommandHistorySession(document);
      this.session = session;
      setReservedEntityIdSource(undefined);
      return session;
    });
  }

  replaceScenarioModel(model: ScenarioDocumentModel, activeScenarioId?: ScenarioId): ScenarioCommandHistorySession {
    return this.trackProjectionContext(() => {
      const session = new ScenarioCommandHistorySession(model, activeScenarioId);
      this.session = session;
      setReservedEntityIdSource(() => session.allScenarioEntityIds());
      return session;
    });
  }

  switchScenario(scenarioId: ScenarioId): ReturnType<ScenarioCommandHistorySession["switchScenario"]> {
    if (!(this.session instanceof ScenarioCommandHistorySession)) throw new Error("The current document does not use Scenario storage.");
    const session = this.session;
    return this.trackProjectionContext(() => session.switchScenario(scenarioId));
  }

  renameScenario(scenarioId: ScenarioId, name: string): ReturnType<ScenarioCommandHistorySession["renameScenario"]> {
    if (!(this.session instanceof ScenarioCommandHistorySession)) throw new Error("The current document does not use Scenario storage.");
    return this.session.renameScenario(scenarioId, name);
  }

  duplicateScenario(scenarioId: ScenarioId, name?: string): ScenarioId {
    if (!(this.session instanceof ScenarioCommandHistorySession)) throw new Error("The current document does not use Scenario storage.");
    const session = this.session;
    return this.trackProjectionContext(() => session.duplicateScenario(scenarioId, name));
  }

  deleteScenario(scenarioId: ScenarioId): ReturnType<ScenarioCommandHistorySession["deleteScenario"]> {
    if (!(this.session instanceof ScenarioCommandHistorySession)) throw new Error("The current document does not use Scenario storage.");
    const session = this.session;
    return this.trackProjectionContext(() => session.deleteScenario(scenarioId));
  }

  addGeneratedScenarios(model: ScenarioDocumentModel, createdScenarioIds: readonly ScenarioId[]): ReturnType<ScenarioCommandHistorySession["addGeneratedScenarios"]> {
    if (!(this.session instanceof ScenarioCommandHistorySession)) throw new Error("Generated Scenarios require a Scenario-aware document session.");
    const session = this.session;
    return this.trackProjectionContext(() => session.addGeneratedScenarios(model, createdScenarioIds));
  }

  activeScenarioId(): ScenarioId | undefined {
    return this.session instanceof ScenarioCommandHistorySession ? this.session.activeScenarioId() : undefined;
  }

  markScenarioFormatMigrationDirty(): void {
    if (!(this.session instanceof ScenarioCommandHistorySession)) throw new Error("The current document does not use Scenario storage.");
    this.session.markFormatMigrationDirty();
  }

  scenarioModel(): ScenarioDocumentModel | undefined {
    return this.session instanceof ScenarioCommandHistorySession ? this.session.scenarioModel() : undefined;
  }

  serializeCurrentDocument(): string {
    const scenarioModel = this.scenarioModel();
    return scenarioModel === undefined ? serializeValidatedCanonicalDocument(this.snapshot().document) : serializeScenarioDocumentModel(scenarioModel);
  }

  execute(command: Parameters<CommandHistorySession["execute"]>[0]): ReturnType<CommandHistorySession["execute"]> {
    return this.session.execute(command);
  }

  executeBatch(id: Parameters<CommandHistorySession["executeBatch"]>[0], commands: Parameters<CommandHistorySession["executeBatch"]>[1]): ReturnType<CommandHistorySession["executeBatch"]> {
    return this.session.executeBatch(id, commands);
  }

  undo(): ReturnType<CommandHistorySession["undo"]> {
    return this.trackProjectionContext(() => this.session.undo());
  }

  redo(): ReturnType<CommandHistorySession["redo"]> {
    return this.trackProjectionContext(() => this.session.redo());
  }
}

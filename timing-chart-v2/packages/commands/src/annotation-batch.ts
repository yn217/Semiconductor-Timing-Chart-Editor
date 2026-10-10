import type { Annotation, AnnotationId, CanonicalDocument } from "@timing-chart-v2/schema";
import { mergeChangeSets } from "./changeset.js";
import { planCommand, type CommandPlanResult } from "./planner.js";
import type { ChangeSet, SemanticCommand } from "./types.js";

type AnnotationUpdate = Extract<SemanticCommand, { type: "annotation.setRotation" | "annotation.setLocked" | "annotation.updateLabelOffset" | "annotation.updateProperties" }>;

function isLocalUpdate(command: SemanticCommand): command is AnnotationUpdate {
  return command.type === "annotation.setRotation" || command.type === "annotation.setLocked"
    || command.type === "annotation.updateLabelOffset" || command.type === "annotation.updateProperties";
}

/** Only target-local updates qualify. Collection/order/reference mutations keep
 * the ordinary sequential planner, whose semantics can depend on other rows. */
export function planAnnotationUpdateBatch(document: CanonicalDocument, commands: readonly SemanticCommand[]): CommandPlanResult | undefined {
  if (commands.length < 2 || !commands.every(isLocalUpdate)) return undefined;
  const byId = new Map(document.annotations.map((annotation) => [annotation.id, annotation] as const));
  const updates = new Map<AnnotationId, Annotation>();
  const forward: ChangeSet[] = [];
  const inverse: ChangeSet[] = [];
  let firstNoOp: Extract<CommandPlanResult, { ok: false }> | undefined;
  for (const command of commands) {
    const annotation = updates.get(command.annotationId) ?? byId.get(command.annotationId);
    // Reuse each command's existing validation and ChangeSet contract against
    // its target, retaining all non-Annotation semantic context unchanged.
    const plan = planCommand({ ...document, annotations: annotation ? [annotation] : [] }, command);
    if (!plan.ok) {
      // A member that would leave its target unchanged is skipped: it adds no
      // ChangeSet and does not alter the document later members see. Real
      // failures still abort the whole batch.
      if (plan.reason !== "no-op") return plan;
      firstNoOp ??= plan;
      continue;
    }
    updates.set(command.annotationId, plan.document.annotations[0]!);
    forward.push(plan.changeSet);
    inverse.push(plan.inverseChangeSet);
  }
  // Every member was a no-op: the batch as a whole is a no-op.
  if (forward.length === 0) return firstNoOp;
  return {
    ok: true,
    document: { ...document, annotations: document.annotations.map((annotation) => updates.get(annotation.id) ?? annotation) },
    changeSet: mergeChangeSets(forward),
    inverseChangeSet: mergeChangeSets(inverse.reverse()),
  };
}

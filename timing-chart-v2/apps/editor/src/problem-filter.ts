import { documentProblemRuleDescriptor, type DocumentProblem } from "@timing-chart-v2/schema";

export function problemMatchesFilter(item: DocumentProblem, filter: string): boolean {
  const query = filter.toLowerCase();
  const searchable = `${item.code} ${item.path} ${item.message} ${item.operation ?? ""} ${item.source ?? ""} ${item.stage ?? ""} ${item.recommendation ?? ""} ${item.commandId ?? ""} ${item.detail ?? ""} ${(item as DocumentProblem & { readonly excerpt?: string }).excerpt ?? ""} ${documentProblemRuleDescriptor(item.code)?.owner ?? ""} ${documentProblemRuleDescriptor(item.code)?.layer ?? ""}`;
  return searchable.toLowerCase().includes(query);
}

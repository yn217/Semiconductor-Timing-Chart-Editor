export function readStartupDocumentPreference(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem("timing-chart-v2.startup-document"); } catch { return null; }
}

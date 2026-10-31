export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build" &&
    process.env.HISTORY_AUTO_SYNC !== "0"
  ) {
    const { startSync } = await import("./lib/server/sync");
    void startSync().catch(error => {
      console.error("[history] startup sync failed:", error instanceof Error ? error.message : "unknown error");
    });
  }
}

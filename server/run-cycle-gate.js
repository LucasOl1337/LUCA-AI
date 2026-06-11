export function createSingleFlightLoop(task) {
  let inFlight = null;
  let rerunRequested = false;

  async function drain() {
    do {
      rerunRequested = false;
      await task();
    } while (rerunRequested);
  }

  return {
    trigger() {
      if (inFlight) {
        rerunRequested = true;
        return inFlight;
      }
      inFlight = drain().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    isRunning() {
      return Boolean(inFlight);
    },
  };
}

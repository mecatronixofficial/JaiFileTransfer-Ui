/** Run a bounded set of upload tasks; stop and drain siblings before cleanup. */
export async function runUploadTasks<T>(
  tasks: ((signal: AbortSignal) => Promise<T>)[],
  concurrency: number,
  signal?: AbortSignal,
): Promise<T[]> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const results: T[] = new Array(tasks.length);
  let next = 0;
  let failed = false;
  let failure: unknown;
  try {
    controller.signal.throwIfAborted();
    await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), tasks.length) }, async () => {
      while (!controller.signal.aborted && next < tasks.length) {
        const index = next++;
        try {
          results[index] = await tasks[index](controller.signal);
        } catch (error) {
          if (!failed) {
            failed = true;
            failure = error;
          }
          controller.abort();
        }
      }
    }));
    if (failed) throw failure;
    controller.signal.throwIfAborted();
    return results;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

export function waitForUploadRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason ?? new DOMException("Upload aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

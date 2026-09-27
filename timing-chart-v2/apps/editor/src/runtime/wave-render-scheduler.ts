export interface WaveRenderJob<Key, Value> {
  readonly key: Key;
  /** Higher-priority work is run first; insertion order breaks ties. */
  readonly priority: number;
  /** Checked immediately before and after run so stale results are not accepted. */
  readonly isCurrent: () => boolean;
  readonly run: () => Value | Promise<Value>;
}

export type WaveRenderJobResult<Key, Value> =
  | Readonly<{ key: Key; status: "completed"; value: Value }>
  | Readonly<{ key: Key; status: "stale" }>
  | Readonly<{ key: Key; status: "error"; error: unknown }>;

export interface WaveRenderSchedulerOptions {
  readonly budgetMs: number;
  readonly initialSliceStartedAt?: number;
  readonly now: () => number;
  readonly shouldYield: () => boolean;
  readonly yieldToNextTask: () => Promise<void>;
  readonly onYield?: (waitMs: number) => void;
}

/** Sequential job/result boundary shared by main-thread and future Worker jobs. */
export class WaveRenderScheduler {
  async runBatch<Key, Value>(jobs: readonly WaveRenderJob<Key, Value>[], options: WaveRenderSchedulerOptions): Promise<readonly WaveRenderJobResult<Key, Value>[]> {
    const ordered = jobs.map((job, insertionOrder) => ({ job, insertionOrder }))
      .sort((left, right) => right.job.priority - left.job.priority || left.insertionOrder - right.insertionOrder);
    const results: WaveRenderJobResult<Key, Value>[] = [];
    let sliceStartedAt = options.initialSliceStartedAt ?? options.now();

    for (let index = 0; index < ordered.length; index += 1) {
      const { job } = ordered[index]!;
      if (!job.isCurrent()) {
        results.push({ key: job.key, status: "stale" });
      } else {
        try {
          const value = await job.run();
          results.push(job.isCurrent() ? { key: job.key, status: "completed", value } : { key: job.key, status: "stale" });
        } catch (error: unknown) {
          results.push(job.isCurrent() ? { key: job.key, status: "error", error } : { key: job.key, status: "stale" });
        }
      }

      if (index < ordered.length - 1 && options.shouldYield() && options.now() - sliceStartedAt >= options.budgetMs) {
        const yieldStartedAt = options.now();
        await options.yieldToNextTask();
        options.onYield?.(Math.max(0, options.now() - yieldStartedAt));
        sliceStartedAt = options.now();
      }
    }

    return results;
  }
}

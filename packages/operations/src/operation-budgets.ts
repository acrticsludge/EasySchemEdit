// packages/operations/src/operation-budgets.ts
// Operation budgets: candidate cells, runtime, memory, worker offload threshold (SUBSPEC-D §2.4, §4.1).
// Pure TypeScript, zero imports — self-contained.

export interface OperationBudget {
  candidateCells: number;   // total cells examined
  changedCells: number;     // actually changed cells
  runtimeEstimateMs: number;
  memoryEstimateBytes: number;
  shouldOffloadToWorker: boolean;  // true if > 25k cells or > 8ms
}

export interface BudgetCheckResult {
  ok: boolean;              // within budget
  reason?: string;          // why not ok
  budget: OperationBudget;
}

export interface BudgetConfig {
  maxCells: number;         // default 25000
  maxRuntimeMs: number;     // default 8
  maxMemoryBytes: number;   // default 50 MiB
  runtimeMsPerCell: number; // default 0.05 ms per cell
  bytesPerCell: number;     // default 24 bytes per cell
}

const DEFAULT_CONFIG: BudgetConfig = {
  maxCells: 25000,
  maxRuntimeMs: 8,
  maxMemoryBytes: 50 * 1024 * 1024, // 50 MiB
  runtimeMsPerCell: 0.05,
  bytesPerCell: 24,
};

export class BudgetEngine {
  private readonly config: BudgetConfig;

  constructor(config: Partial<BudgetConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  get maxCells(): number {
    return this.config.maxCells;
  }

  get maxRuntimeMs(): number {
    return this.config.maxRuntimeMs;
  }

  get maxMemoryBytes(): number {
    return this.config.maxMemoryBytes;
  }

  // Check if an operation is within budget.
  checkBudget(candidateCells: number, changedCells: number): BudgetCheckResult {
    const runtimeEstimateMs = this.estimateRuntime(candidateCells);
    const memoryEstimateBytes = this.estimateMemory(candidateCells);
    const shouldOffload = this.shouldOffloadToWorker(candidateCells, runtimeEstimateMs);

    const budget: OperationBudget = {
      candidateCells,
      changedCells,
      runtimeEstimateMs,
      memoryEstimateBytes,
      shouldOffloadToWorker: shouldOffload,
    };

    const reasons: string[] = [];

    if (candidateCells > this.config.maxCells) {
      reasons.push(`Candidate cells ${candidateCells} exceed max ${this.config.maxCells}`);
    }
    if (runtimeEstimateMs > this.config.maxRuntimeMs) {
      reasons.push(`Estimated runtime ${runtimeEstimateMs.toFixed(2)}ms exceeds max ${this.config.maxRuntimeMs}ms`);
    }
    if (memoryEstimateBytes > this.config.maxMemoryBytes) {
      reasons.push(`Estimated memory ${(memoryEstimateBytes / 1024 / 1024).toFixed(2)}MiB exceeds max ${(this.config.maxMemoryBytes / 1024 / 1024).toFixed(2)}MiB`);
    }

    return {
      ok: reasons.length === 0,
      reason: reasons.length > 0 ? reasons.join('; ') : undefined,
      budget,
    };
  }

  // Estimate runtime in milliseconds based on cell count.
  estimateRuntime(cellCount: number): number {
    return cellCount * this.config.runtimeMsPerCell;
  }

  // Estimate memory in bytes based on cell count.
  estimateMemory(cellCount: number): number {
    return cellCount * this.config.bytesPerCell;
  }

  // Determine if operation should be offloaded to a worker.
  shouldOffloadToWorker(candidateCells: number, runtimeEstimateMs?: number): boolean {
    const runtime = runtimeEstimateMs ?? this.estimateRuntime(candidateCells);
    return candidateCells > this.config.maxCells || runtime > this.config.maxRuntimeMs;
  }

  // Update configuration at runtime.
  updateConfig(updates: Partial<BudgetConfig>): void {
    this.config.maxCells = updates.maxCells ?? this.config.maxCells;
    this.config.maxRuntimeMs = updates.maxRuntimeMs ?? this.config.maxRuntimeMs;
    this.config.maxMemoryBytes = updates.maxMemoryBytes ?? this.config.maxMemoryBytes;
    this.config.runtimeMsPerCell = updates.runtimeMsPerCell ?? this.config.runtimeMsPerCell;
    this.config.bytesPerCell = updates.bytesPerCell ?? this.config.bytesPerCell;
  }
}

// ============================================================================
// Default budget engine instance
// ============================================================================

const defaultEngine = new BudgetEngine();

// ============================================================================
// Convenience functions
// ============================================================================

export function checkBudget(
  candidateCells: number,
  changedCells: number,
  config?: Partial<BudgetConfig>,
): BudgetCheckResult {
  const engine = config ? new BudgetEngine(config) : defaultEngine;
  return engine.checkBudget(candidateCells, changedCells);
}

export function estimateRuntime(cellCount: number, runtimeMsPerCell = 0.05): number {
  return cellCount * runtimeMsPerCell;
}

export function estimateMemory(cellCount: number, bytesPerCell = 24): number {
  return cellCount * bytesPerCell;
}

export function shouldOffloadToWorker(
  candidateCells: number,
  runtimeEstimateMs?: number,
  maxCells = 25000,
  maxRuntimeMs = 8,
): boolean {
  const runtime = runtimeEstimateMs ?? estimateRuntime(candidateCells);
  return candidateCells > maxCells || runtime > maxRuntimeMs;
}

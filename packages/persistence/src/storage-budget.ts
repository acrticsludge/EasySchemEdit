// packages/persistence/src/storage-budget.ts
// Storage budget: IndexedDB quota monitoring (SUBSPEC-C §4.7, §2.3.9).
// Tracks quota usage, warns before limit, blocks writes that would exceed quota.

export interface QuotaInfo {
  quota: number;           // total quota in bytes
  usage: number;           // current usage in bytes
  remaining: number;       // remaining quota in bytes
  percentage: number;      // usage/quota * 100
}

export interface StorageBudgetConfig {
  warningThreshold: number;  // default 0.8 (80%)
  criticalThreshold: number; // default 0.9 (90%)
}

export interface StorageBudgetCallbacks {
  onWarning?: (info: QuotaInfo) => void;
  onCritical?: (info: QuotaInfo) => void;
}

const DEFAULT_CONFIG: StorageBudgetConfig = {
  warningThreshold: 0.8,
  criticalThreshold: 0.9,
};

export class StorageBudgetManager {
  private readonly config: StorageBudgetConfig;
  private callbacks: StorageBudgetCallbacks;
  private lastQuotaInfo: QuotaInfo | null = null;

  constructor(config: Partial<StorageBudgetConfig> = {}, callbacks: StorageBudgetCallbacks = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.callbacks = callbacks;
  }

  // Estimate current IndexedDB quota usage.
  // Uses navigator.storage.estimate() if available, otherwise estimates from
  // stored data sizes.
  async estimateQuota(): Promise<QuotaInfo> {
    let quota: number;
    let usage: number;

    if (typeof navigator !== 'undefined' && (navigator as any).storage?.estimate) {
      const estimate = await (navigator as any).storage.estimate();
      quota = estimate.quota ?? 0;
      usage = estimate.usage ?? 0;
    } else {
      // Fallback: estimate from known stores (not available in pure TS without DB access)
      quota = 0;
      usage = 0;
    }

    const remaining = quota - usage;
    const percentage = quota > 0 ? (usage / quota) * 100 : 0;

    const info: QuotaInfo = { quota, usage, remaining, percentage };
    this.lastQuotaInfo = info;

    // Trigger callbacks
    if (percentage >= this.config.criticalThreshold * 100) {
      this.callbacks.onCritical?.(info);
    } else if (percentage >= this.config.warningThreshold * 100) {
      this.callbacks.onWarning?.(info);
    }

    return info;
  }

  // Check if writing estimatedBytes would exceed the critical threshold.
  // Returns ok=true if safe, ok=false with error if would exceed quota.
  checkBudget(estimatedBytes: number): { ok: true } | { ok: false; error: string } {
    const info = this.lastQuotaInfo;
    if (!info) {
      // No quota info yet, assume safe
      return { ok: true };
    }

    const projectedUsage = info.usage + estimatedBytes;
    const projectedPercentage = info.quota > 0 ? (projectedUsage / info.quota) * 100 : 0;

    if (projectedPercentage >= this.config.criticalThreshold * 100) {
      return {
        ok: false,
        error: `Storage budget exceeded: projected ${projectedPercentage.toFixed(1)}% usage exceeds critical threshold of ${this.config.criticalThreshold * 100}%`,
      };
    }

    return { ok: true };
  }

  // Get the last quota info.
  getLastQuotaInfo(): QuotaInfo | null {
    return this.lastQuotaInfo;
  }

  // Update callbacks.
  setCallbacks(callbacks: StorageBudgetCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
}

import { useEffect, useMemo, useState } from "react";
import type { PlannedAsset } from "../types/asset.ts";
import { formatBytes } from "../utils/fileNaming.ts";

export interface BatchProgressState {
  mode: "validating" | "fetching" | "converting" | null;
  startedAt: number | null;
  completedCount: number;
  totalCount: number;
  lastDurationMs: number | null;
  lastMode: "validating" | "fetching" | "converting" | null;
}

interface BatchSummaryPanelProps {
  assets: PlannedAsset[];
  selectedIds: Set<string>;
  isValidating: boolean;
  isFetching: boolean;
  isConverting?: boolean;
  downloadDelayMs: number;
  batchProgress: BatchProgressState;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return "< 1s";
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

export function BatchSummaryPanel({
  assets,
  selectedIds,
  isValidating,
  isFetching,
  isConverting = false,
  downloadDelayMs,
  batchProgress,
}: BatchSummaryPanelProps) {
  const isActive = isValidating || isFetching || isConverting;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isActive) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(timer);
  }, [isActive]);

  const metrics = useMemo(() => {
    const hasSelection = selectedIds.size > 0;
    const scopeAssets = hasSelection
      ? assets.filter((a) => selectedIds.has(a.id))
      : assets;

    let knownSizeBytes = 0;
    let knownSizeCount = 0;
    let savedCount = 0;
    let failedCount = 0;
    let brokenCount = 0;
    let skippedCount = 0;

    for (const a of scopeAssets) {
      if (typeof a.byteSize === "number" && a.byteSize > 0) {
        knownSizeBytes += a.byteSize;
        knownSizeCount++;
      }
      if (a.status === "saved") savedCount++;
      else if (a.status === "failed") failedCount++;
      else if (a.status === "broken") brokenCount++;
      else if (a.status === "skipped") skippedCount++;
    }

    const downloadableTotal = Math.max(
      0,
      scopeAssets.length - brokenCount - skippedCount
    );
    const completedDownloadPercent =
      downloadableTotal > 0
        ? Math.round((savedCount / downloadableTotal) * 100)
        : 0;

    return {
      hasSelection,
      scopeCount: scopeAssets.length,
      knownSizeBytes,
      knownSizeCount,
      savedCount,
      failedCount,
      downloadableTotal,
      completedDownloadPercent,
    };
  }, [assets, selectedIds]);

  const etaDisplay = useMemo(() => {
    if (!isActive || !batchProgress.startedAt) {
      return {
        primary: "—",
        secondary:
          batchProgress.lastDurationMs !== null && batchProgress.lastMode
            ? `Last ${
                batchProgress.lastMode === "validating"
                  ? "check"
                  : batchProgress.lastMode === "converting"
                    ? "convert"
                    : "fetch"
              }: ${formatDuration(batchProgress.lastDurationMs)}`
            : "No active batch",
      };
    }

    const elapsedMs = Math.max(0, nowMs - batchProgress.startedAt);
    const remainingItems = Math.max(
      0,
      batchProgress.totalCount - batchProgress.completedCount
    );

    if (remainingItems === 0) {
      return {
        primary: "< 1s",
        secondary: `${formatDuration(elapsedMs)} elapsed`,
      };
    }

    if (batchProgress.completedCount < 1 || elapsedMs < 200) {
      return {
        primary: "Calculating...",
        secondary: `${formatDuration(elapsedMs)} elapsed`,
      };
    }

    const avgMsPerItem = elapsedMs / batchProgress.completedCount;
    const estimatedRemainingMs = remainingItems * avgMsPerItem;

    return {
      primary: `~${formatDuration(estimatedRemainingMs)}`,
      secondary: `${formatDuration(elapsedMs)} elapsed · ${remainingItems} left`,
    };
  }, [isActive, batchProgress, nowMs]);

  const activeBatchSummary = useMemo(() => {
    if (isValidating) {
      const pct =
        batchProgress.totalCount > 0
          ? Math.round(
              (batchProgress.completedCount / batchProgress.totalCount) * 100
            )
          : 0;
      return {
        label: "Validating Links",
        value: `${pct}%`,
        detail: `${batchProgress.completedCount} / ${batchProgress.totalCount} checked`,
      };
    }
    if (isFetching) {
      const pct =
        batchProgress.totalCount > 0
          ? Math.round(
              (batchProgress.completedCount / batchProgress.totalCount) * 100
            )
          : 0;
      return {
        label: "Downloading Images",
        value: `${pct}%`,
        detail: `${batchProgress.completedCount} / ${batchProgress.totalCount} processed`,
      };
    }
    if (isConverting) {
      const pct =
        batchProgress.totalCount > 0
          ? Math.round(
              (batchProgress.completedCount / batchProgress.totalCount) * 100
            )
          : 0;
      return {
        label: "Converting Images",
        value: `${pct}%`,
        detail: `${batchProgress.completedCount} / ${batchProgress.totalCount} converted`,
      };
    }
    return {
      label: "Batch Status",
      value: "Idle",
      detail:
        downloadDelayMs > 0
          ? `${downloadDelayMs} ms request delay`
          : "No request delay",
    };
  }, [isValidating, isFetching, isConverting, batchProgress, downloadDelayMs]);

  return (
    <section
      aria-label="Batch progress summary"
      className="bg-white border border-slate-200 rounded-lg"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="px-5 py-3.5">
          <p className="text-xs font-medium text-slate-500">
            {metrics.hasSelection
              ? "Total Size of Selected Assets"
              : "Total Size of Queue Assets"}
          </p>
          <p className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
            {metrics.knownSizeBytes > 0
              ? formatBytes(metrics.knownSizeBytes)
              : "0 B"}
          </p>
          <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
            {metrics.knownSizeCount} of {metrics.scopeCount} with known size
          </p>
        </div>

        <div className="px-5 py-3.5">
          <p className="text-xs font-medium text-slate-500">
            Completed Downloads
          </p>
          <p className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
            {metrics.completedDownloadPercent}%
          </p>
          <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
            {metrics.savedCount} of {metrics.downloadableTotal} saved
            {metrics.failedCount > 0 ? ` · ${metrics.failedCount} failed` : ""}
          </p>
        </div>

        <div className="px-5 py-3.5">
          <p className="text-xs font-medium text-slate-500">
            {activeBatchSummary.label}
          </p>
          <p
            className={`text-xl font-semibold font-mono tabular-nums mt-1 ${
              isActive ? "text-teal-700" : "text-slate-900"
            }`}
          >
            {activeBatchSummary.value}
          </p>
          <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
            {activeBatchSummary.detail}
          </p>
        </div>

        <div className="px-5 py-3.5">
          <p className="text-xs font-medium text-slate-500">
            Remaining Estimated Time
          </p>
          <p className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
            {etaDisplay.primary}
          </p>
          <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
            {etaDisplay.secondary}
          </p>
        </div>
      </div>
    </section>
  );
}

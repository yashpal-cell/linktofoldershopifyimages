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

function normalizeFormatLabel(asset: PlannedAsset): string {
  const fromMime = (mime?: string): string | null => {
    if (!mime) return null;
    const base = mime.split(";")[0].trim().toLowerCase();
    if (!base.startsWith("image/")) return null;
    const sub = base.slice("image/".length);
    if (sub === "jpeg" || sub === "pjpeg") return "JPG";
    if (sub === "svg+xml") return "SVG";
    if (sub === "x-icon" || sub === "vnd.microsoft.icon") return "ICO";
    if (sub === "x-ms-bmp") return "BMP";
    return sub.toUpperCase();
  };

  const fromExt = (ext?: string): string | null => {
    if (!ext) return null;
    const cleaned = ext.replace(/^\./, "").trim().toUpperCase();
    if (!cleaned) return null;
    if (cleaned === "JPEG") return "JPG";
    if (cleaned === "TIF") return "TIFF";
    return cleaned;
  };

  if (asset.status === "saved") {
    return (
      fromMime(asset.contentType) ??
      fromExt(asset.detectedExtension) ??
      fromExt(asset.plannedExtension) ??
      "OTHER"
    );
  }

  return (
    fromExt(asset.plannedExtension) ??
    fromExt(asset.detectedExtension) ??
    fromMime(asset.contentType) ??
    "OTHER"
  );
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
    const formatCounts = new Map<string, number>();

    for (const a of scopeAssets) {
      if (typeof a.byteSize === "number" && a.byteSize > 0) {
        knownSizeBytes += a.byteSize;
        knownSizeCount++;
      }
      if (a.status === "saved") savedCount++;
      else if (a.status === "failed") failedCount++;
      else if (a.status === "broken") brokenCount++;
      else if (a.status === "skipped") skippedCount++;

      if (a.status !== "skipped") {
        const fmt = normalizeFormatLabel(a);
        formatCounts.set(fmt, (formatCounts.get(fmt) ?? 0) + 1);
      }
    }

    const downloadableTotal = Math.max(
      0,
      scopeAssets.length - brokenCount - skippedCount
    );
    const completedDownloadPercent =
      downloadableTotal > 0
        ? Math.round((savedCount / downloadableTotal) * 100)
        : 0;

    const activeCount = Math.max(0, scopeAssets.length - skippedCount);
    const unknownActiveCount = Math.max(0, downloadableTotal - knownSizeCount);
    const avgBytesPerKnown =
      knownSizeCount > 0 ? knownSizeBytes / knownSizeCount : 0;
    const isExactSize =
      downloadableTotal > 0 && knownSizeCount >= downloadableTotal;
    const estimatedTotalBytes =
      knownSizeCount > 0
        ? Math.round(knownSizeBytes + unknownActiveCount * avgBytesPerKnown)
        : 0;

    const formatBreakdown = Array.from(formatCounts.entries())
      .map(([format, count]) => ({
        format,
        count,
        percent: activeCount > 0 ? Math.round((count / activeCount) * 100) : 0,
      }))
      .sort((a, b) =>
        b.count !== a.count ? b.count - a.count : a.format.localeCompare(b.format)
      );

    return {
      hasSelection,
      scopeCount: scopeAssets.length,
      activeCount,
      knownSizeBytes,
      knownSizeCount,
      estimatedTotalBytes,
      isExactSize,
      avgBytesPerKnown,
      savedCount,
      failedCount,
      downloadableTotal,
      completedDownloadPercent,
      formatBreakdown,
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

  const sizeHeadline =
    metrics.knownSizeCount === 0
      ? "0 B"
      : metrics.isExactSize
        ? formatBytes(metrics.knownSizeBytes)
        : `~${formatBytes(metrics.estimatedTotalBytes)}`;

  const sizeSubtext =
    metrics.knownSizeCount === 0
      ? `0 of ${metrics.downloadableTotal} measured · validate to estimate`
      : metrics.isExactSize
        ? `Exact size across all ${metrics.knownSizeCount} assets`
        : `${formatBytes(metrics.knownSizeBytes)} known (${metrics.knownSizeCount}/${metrics.downloadableTotal}) · ~${formatBytes(Math.round(metrics.avgBytesPerKnown))}/img`;

  return (
    <section
      aria-label="Batch progress summary"
      className="bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="px-5 py-3.5">
          <p className="text-xs font-medium text-slate-500">
            {metrics.hasSelection
              ? "Estimated Size of Selected Assets"
              : "Estimated Size of Queue Assets"}
          </p>
          <p className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
            {sizeHeadline}
          </p>
          <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5 truncate" title={sizeSubtext}>
            {sizeSubtext}
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

      {/* Format Breakdown Strip (Zero-pill inline typography) */}
      <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          <span className="font-medium text-slate-600 whitespace-nowrap">
            {metrics.hasSelection ? "Selected Formats:" : "Queue Formats:"}
          </span>
          {metrics.formatBreakdown.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono tabular-nums text-slate-700">
              {metrics.formatBreakdown.map((entry, idx) => (
                <span key={entry.format} className="inline-flex items-center gap-1 whitespace-nowrap">
                  {idx > 0 && (
                    <span className="text-slate-300 mr-1" aria-hidden="true">
                      ·
                    </span>
                  )}
                  <span className="font-semibold text-slate-900">{entry.format}</span>
                  <span>{entry.count}</span>
                  <span className="text-slate-400">({entry.percent}%)</span>
                </span>
              ))}
            </div>
          ) : (
            <span className="font-mono text-slate-400">—</span>
          )}
        </div>

        <div className="font-mono tabular-nums text-slate-500 whitespace-nowrap shrink-0">
          <span>
            {metrics.activeCount} {metrics.activeCount === 1 ? "image" : "images"}
            {metrics.hasSelection ? " selected" : " in queue"}
          </span>
          {metrics.knownSizeCount > 0 && !metrics.isExactSize && (
            <>
              <span aria-hidden="true"> · </span>
              <span>Est. total {formatBytes(metrics.estimatedTotalBytes)}</span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

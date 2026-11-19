import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  EyeOff,
  FileArchive,
  FileEdit,
  FolderInput,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Unlink,
  X,
} from "lucide-react";
import type {
  AssetStatus,
  AssetViewMode,
  DuplicateMatchScope,
  MappingConfig,
  PlannedAsset,
} from "../types/asset.ts";
import type { BulkRenamePreviewItem } from "../utils/bulkRename.ts";
import { type DuplicateAnalysis, formatBytes } from "../utils/fileNaming.ts";
import { BulkRenameModal } from "./BulkRenameModal.tsx";
import { FullScreenPreviewModal } from "./FullScreenPreviewModal.tsx";
import { ImagePreviewPanel } from "./ImagePreviewPanel.tsx";

interface AssetQueueTableProps {
  assets: PlannedAsset[];
  effectiveAssets: PlannedAsset[];
  assetViewMode: AssetViewMode;
  onChangeAssetViewMode: (mode: AssetViewMode) => void;
  duplicateMatchScope: DuplicateMatchScope;
  onChangeDuplicateMatchScope: (scope: DuplicateMatchScope) => void;
  duplicateAnalysis: DuplicateAnalysis;
  mapping: MappingConfig;
  selectedIds: Set<string>;
  selectedFolder: string | null;
  onClearFolderFilter: () => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectVisible: (visibleIds: string[], selectAll: boolean) => void;
  onClearSelection: () => void;
  isValidating: boolean;
  isFetching: boolean;
  isConverting: boolean;
  isZipping: boolean;
  zipProgress: number;
  hasTransformActive: boolean;
  supportsFolderSave: boolean;
  onValidateImages: () => void;
  onPauseValidation: () => void;
  onRevalidateBroken: () => void;
  onStartFetch: () => void;
  onPauseFetch: () => void;
  onRetryFailed: () => void;
  onConvertSaved: () => void;
  onPauseConvert: () => void;
  onBulkRename: (items: BulkRenamePreviewItem[]) => void;
  onExportZip: () => void;
  onSaveToFolder: () => void;
  onExportCsv: () => void;
}

type FilterTab = "all" | AssetStatus;

export function AssetQueueTable({
  assets,
  effectiveAssets,
  assetViewMode,
  onChangeAssetViewMode,
  duplicateMatchScope,
  onChangeDuplicateMatchScope,
  duplicateAnalysis,
  mapping,
  selectedIds,
  selectedFolder,
  onClearFolderFilter,
  onToggleSelect,
  onToggleSelectVisible,
  onClearSelection,
  isValidating,
  isFetching,
  isConverting,
  isZipping,
  zipProgress,
  hasTransformActive,
  supportsFolderSave,
  onValidateImages,
  onPauseValidation,
  onRevalidateBroken,
  onStartFetch,
  onPauseFetch,
  onRetryFailed,
  onConvertSaved,
  onPauseConvert,
  onBulkRename,
  onExportZip,
  onSaveToFolder,
  onExportCsv,
}: AssetQueueTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusTab, setStatusTab] = useState<FilterTab>("all");
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [fullScreenAssetId, setFullScreenAssetId] = useState<string | null>(null);
  const [showBulkRenameModal, setShowBulkRenameModal] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const folderScopeAll = useMemo(() => {
    if (!selectedFolder) return assets;
    return assets.filter((a) => a.styleFolder === selectedFolder);
  }, [assets, selectedFolder]);

  const folderDuplicateCount = useMemo(() => {
    let count = 0;
    for (const a of folderScopeAll) {
      if (duplicateAnalysis.duplicateIds.has(a.id)) count++;
    }
    return count;
  }, [folderScopeAll, duplicateAnalysis.duplicateIds]);

  const folderUniqueCount = Math.max(
    0,
    folderScopeAll.length - folderDuplicateCount
  );

  const folderFiltered = useMemo(() => {
    if (!selectedFolder) return effectiveAssets;
    return effectiveAssets.filter((a) => a.styleFolder === selectedFolder);
  }, [effectiveAssets, selectedFolder]);

  const counts = useMemo(() => {
    let ready = 0;
    let validating = 0;
    let reachable = 0;
    let broken = 0;
    let fetching = 0;
    let saved = 0;
    let failed = 0;
    let skipped = 0;
    let totalBytes = 0;

    for (const a of folderFiltered) {
      if (a.status === "ready") ready++;
      else if (a.status === "validating") validating++;
      else if (a.status === "reachable") reachable++;
      else if (a.status === "broken") broken++;
      else if (a.status === "fetching") fetching++;
      else if (a.status === "saved") {
        saved++;
        totalBytes += a.byteSize ?? 0;
      } else if (a.status === "failed") failed++;
      else if (a.status === "skipped") skipped++;
    }

    return {
      all: folderFiltered.length,
      ready,
      validating,
      reachable,
      broken,
      fetching,
      saved,
      failed,
      skipped,
      totalBytes,
    };
  }, [folderFiltered]);

  const visibleAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return folderFiltered.filter((a) => {
      if (statusTab !== "all" && a.status !== statusTab) return false;
      if (!q) return true;
      return (
        a.styleFolder.toLowerCase().includes(q) ||
        a.targetFileName.toLowerCase().includes(q) ||
        a.rawFileName.toLowerCase().includes(q)
      );
    });
  }, [folderFiltered, statusTab, searchQuery]);

  const previewIndex = useMemo(() => {
    if (!previewAssetId) return -1;
    return visibleAssets.findIndex((a) => a.id === previewAssetId);
  }, [visibleAssets, previewAssetId]);

  const activePreviewAsset =
    previewIndex >= 0 ? visibleAssets[previewIndex] : null;

  const fullScreenIndex = useMemo(() => {
    if (!fullScreenAssetId) return -1;
    return visibleAssets.findIndex((a) => a.id === fullScreenAssetId);
  }, [visibleAssets, fullScreenAssetId]);

  const activeFullScreenAsset =
    fullScreenIndex >= 0 ? visibleAssets[fullScreenIndex] : null;

  const visibleIds = useMemo(
    () => visibleAssets.map((a) => a.id),
    [visibleAssets]
  );

  const visibleSelectedCount = useMemo(() => {
    if (selectedIds.size === 0) return 0;
    let count = 0;
    for (const id of visibleIds) {
      if (selectedIds.has(id)) count++;
    }
    return count;
  }, [visibleIds, selectedIds]);

  const allVisibleSelected =
    visibleAssets.length > 0 && visibleSelectedCount === visibleAssets.length;
  const someVisibleSelected =
    visibleSelectedCount > 0 && visibleSelectedCount < visibleAssets.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const hasSelection = selectedIds.size > 0;
  const selectedAssetsInOrder = useMemo(() => {
    if (selectedIds.size === 0) return [];
    const visibleSet = new Set(visibleAssets.map((a) => a.id));
    const inVisible = visibleAssets.filter((a) => selectedIds.has(a.id));
    const offFilter = effectiveAssets.filter(
      (a) => selectedIds.has(a.id) && !visibleSet.has(a.id)
    );
    return [...inVisible, ...offFilter];
  }, [effectiveAssets, visibleAssets, selectedIds]);

  const batchScope = useMemo(
    () =>
      hasSelection
        ? effectiveAssets.filter((a) => selectedIds.has(a.id))
        : effectiveAssets,
    [effectiveAssets, selectedIds, hasSelection]
  );

  const globalReadyCount = effectiveAssets.filter((a) => a.status === "ready").length;
  const globalReachableCount = effectiveAssets.filter((a) => a.status === "reachable").length;
  const globalBrokenCount = effectiveAssets.filter((a) => a.status === "broken").length;
  const globalSavedCount = effectiveAssets.filter((a) => a.status === "saved").length;
  const globalFailedCount = effectiveAssets.filter((a) => a.status === "failed").length;
  const globalActionableCount = effectiveAssets.filter((a) => a.status !== "skipped").length;

  const scopeReadyCount = batchScope.filter((a) => a.status === "ready").length;
  const scopeReachableCount = batchScope.filter((a) => a.status === "reachable").length;
  const scopeBrokenCount = batchScope.filter((a) => a.status === "broken").length;
  const scopeSavedCount = batchScope.filter((a) => a.status === "saved").length;
  const scopeSavedNeedingConvertCount = batchScope.filter(
    (a) => a.status === "saved" && Boolean(a.blob) && Boolean(a.needsTransform)
  ).length;
  const scopeSavedWithBlobCount = batchScope.filter(
    (a) => a.status === "saved" && Boolean(a.blob)
  ).length;
  const scopeFailedCount = batchScope.filter((a) => a.status === "failed").length;
  const scopeFetchableCount = batchScope.filter(
    (a) => a.status === "ready" || a.status === "reachable" || a.status === "fetching"
  ).length;

  const validatedTotal = globalReachableCount + globalBrokenCount + globalSavedCount + globalFailedCount;
  const validationPercent =
    globalActionableCount > 0
      ? Math.round((validatedTotal / globalActionableCount) * 100)
      : 0;

  const downloadableTotal = globalActionableCount - globalBrokenCount;
  const fetchPercent =
    downloadableTotal > 0
      ? Math.round(((globalSavedCount + globalFailedCount) / downloadableTotal) * 100)
      : 0;

  const validatableCount = scopeReadyCount > 0
    ? scopeReadyCount
    : scopeReachableCount + scopeBrokenCount;

  const showProgressStrip =
    isValidating ||
    isFetching ||
    globalSavedCount > 0 ||
    globalFailedCount > 0 ||
    globalReachableCount > 0 ||
    globalBrokenCount > 0;

  const activeProgressPercent = isValidating
    ? validationPercent
    : isFetching || globalSavedCount > 0 || globalFailedCount > 0
      ? fetchPercent
      : validationPercent;

  const activeProgressLabel = isValidating
    ? `Validating links · ${validatedTotal}/${globalActionableCount}`
    : isFetching || globalSavedCount > 0 || globalFailedCount > 0
      ? `${globalSavedCount + globalFailedCount}/${downloadableTotal} fetched`
      : `Validated · ${globalReachableCount} active, ${globalBrokenCount} broken`;

  return (
    <section id="queue-section" className="bg-white border border-slate-200 rounded-lg">
      {/* Header & Batch Controls */}
      <div className="px-5 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-slate-900">
              03. Image Asset Queue
            </h2>
            {selectedFolder && (
              <button
                type="button"
                onClick={onClearFolderFilter}
                className="inline-flex items-center gap-1 text-xs font-mono text-teal-800 hover:text-teal-950 underline cursor-pointer"
              >
                {selectedFolder}
                <X className="w-3 h-3" />
              </button>
            )}
            {hasSelection && (
              <span className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums text-teal-800">
                <span aria-hidden="true">·</span>
                <span>{selectedIds.size} selected</span>
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="underline hover:text-teal-950 cursor-pointer"
                >
                  Clear
                </button>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
            {counts.reachable} active · {counts.broken} broken · {counts.saved} saved · {counts.ready + counts.fetching} queued · {counts.failed} failed
            {counts.totalBytes > 0 ? ` · ${formatBytes(counts.totalBytes)}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isValidating ? (
            <button
              type="button"
              onClick={onPauseValidation}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-amber-50 border border-amber-300 rounded-md hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              Pause Validation
            </button>
          ) : (
            <button
              type="button"
              onClick={onValidateImages}
              disabled={isFetching || validatableCount === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
              {hasSelection
                ? `Validate Selected (${validatableCount})`
                : scopeReadyCount === 0 && (scopeReachableCount > 0 || scopeBrokenCount > 0)
                  ? `Re-validate Links (${validatableCount})`
                  : `Validate Images (${validatableCount})`}
            </button>
          )}

          {scopeBrokenCount > 0 && !isValidating && !isFetching && (
            <button
              type="button"
              onClick={onRevalidateBroken}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Re-check Broken ({scopeBrokenCount})
            </button>
          )}

          {isFetching ? (
            <button
              type="button"
              onClick={onPauseFetch}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-amber-50 border border-amber-300 rounded-md hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              Pause Fetch
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartFetch}
              disabled={isValidating || isConverting || scopeFetchableCount === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              {hasSelection
                ? `Fetch Selected (${scopeFetchableCount})`
                : scopeSavedCount > 0 && scopeFetchableCount > 0
                  ? `Resume Fetch (${scopeFetchableCount})`
                  : `Fetch All Images (${scopeFetchableCount})`}
            </button>
          )}

          {isConverting ? (
            <button
              type="button"
              onClick={onPauseConvert}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-amber-50 border border-amber-300 rounded-md hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              Pause Convert
            </button>
          ) : (
            scopeSavedWithBlobCount > 0 &&
            (hasTransformActive || scopeSavedNeedingConvertCount > 0) && (
              <button
                type="button"
                onClick={onConvertSaved}
                disabled={isFetching || isValidating || isZipping}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 ${
                  scopeSavedNeedingConvertCount > 0
                    ? "text-teal-900 bg-teal-50 border-teal-300 hover:bg-teal-100"
                    : "text-slate-700 bg-white border-slate-200 hover:bg-slate-50"
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5 text-teal-700" />
                {scopeSavedNeedingConvertCount > 0
                  ? `Convert Saved (${scopeSavedNeedingConvertCount})`
                  : `Re-convert Saved (${scopeSavedWithBlobCount})`}
              </button>
            )
          )}

          {scopeFailedCount > 0 && !isFetching && !isValidating && !isConverting && (
            <button
              type="button"
              onClick={onRetryFailed}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry Failed ({scopeFailedCount})
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowBulkRenameModal(true)}
            disabled={
              selectedAssetsInOrder.length === 0 ||
              isFetching ||
              isValidating ||
              isConverting ||
              isZipping
            }
            title={
              selectedAssetsInOrder.length === 0
                ? "Select one or more rows using the checkboxes to bulk rename"
                : `Bulk rename ${selectedAssetsInOrder.length} selected asset(s)`
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileEdit className="w-3.5 h-3.5 text-teal-700" />
            {selectedAssetsInOrder.length > 0
              ? `Bulk Rename (${selectedAssetsInOrder.length})`
              : "Bulk Rename"}
          </button>

          <button
            type="button"
            onClick={onExportZip}
            disabled={scopeSavedCount === 0 || isZipping || isConverting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isZipping ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileArchive className="w-3.5 h-3.5" />
            )}
            {isZipping
              ? `Packaging ${zipProgress}%`
              : `Download ZIP (${scopeSavedCount})`}
          </button>

          {supportsFolderSave && (
            <button
              type="button"
              onClick={onSaveToFolder}
              disabled={scopeSavedCount === 0}
              title="Write style folders and image files directly into a chosen local folder"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FolderInput className="w-3.5 h-3.5" />
              Save to Folder
            </button>
          )}

          <button
            type="button"
            onClick={onExportCsv}
            disabled={effectiveAssets.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Report CSV
          </button>
        </div>
      </div>

      {/* Progress Strip */}
      {showProgressStrip && globalActionableCount > 0 && (
        <div className="px-5 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-150 ${
                globalBrokenCount > 0 && !isFetching && globalSavedCount === 0
                  ? "bg-amber-600"
                  : "bg-teal-700"
              }`}
              style={{ width: `${activeProgressPercent}%` }}
            />
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-600 shrink-0">
            {activeProgressPercent}% · {activeProgressLabel}
          </span>
        </div>
      )}

      {/* All vs Unique Duplicate Filter Bar */}
      <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label="Toggle between all assets and unique filenames"
            className="inline-flex items-center gap-1 p-0.5 bg-slate-200/75 rounded-md"
          >
            <button
              type="button"
              onClick={() => onChangeAssetViewMode("all")}
              className={`px-3 py-1 text-xs font-medium font-mono tabular-nums rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                assetViewMode === "all"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All ({folderScopeAll.length})
            </button>
            <button
              type="button"
              onClick={() => onChangeAssetViewMode("unique")}
              className={`px-3 py-1 text-xs font-medium font-mono tabular-nums rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                assetViewMode === "unique"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Unique ({folderUniqueCount})
            </button>
          </div>

          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <span className="whitespace-nowrap">Match:</span>
            <select
              value={duplicateMatchScope}
              onChange={(e) =>
                onChangeDuplicateMatchScope(
                  e.target.value as DuplicateMatchScope
                )
              }
              aria-label="Duplicate filename match scope"
              className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-teal-600 cursor-pointer"
            >
              <option value="filename">Duplicate filename (any folder)</option>
              <option value="folder">Same folder + filename</option>
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {folderDuplicateCount > 0 ? (
            assetViewMode === "all" ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="text-amber-800 font-medium font-mono tabular-nums">
                  {folderDuplicateCount} duplicate filename
                  {folderDuplicateCount === 1 ? "" : "s"} highlighted
                </span>
                <span className="text-slate-300" aria-hidden="true">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => onChangeAssetViewMode("unique")}
                  className="text-teal-700 hover:text-teal-900 font-medium underline underline-offset-2 cursor-pointer whitespace-nowrap"
                >
                  Hide duplicates
                </button>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                <span className="text-slate-700 font-mono tabular-nums">
                  {folderDuplicateCount} duplicate filename
                  {folderDuplicateCount === 1 ? "" : "s"} hidden from view &amp; batch
                </span>
                <span className="text-slate-300" aria-hidden="true">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => onChangeAssetViewMode("all")}
                  className="text-teal-700 hover:text-teal-900 font-medium underline underline-offset-2 cursor-pointer whitespace-nowrap"
                >
                  Show all
                </button>
              </>
            )
          ) : (
            <span className="text-slate-500 font-mono tabular-nums">
              All {folderScopeAll.length} filenames are unique
            </span>
          )}
        </div>
      </div>

      {/* Search & Status Tabs */}
      <div className="px-5 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md w-fit overflow-x-auto">
          {(
            [
              { key: "all", label: `All (${counts.all})` },
              { key: "ready", label: `Ready (${counts.ready})` },
              { key: "reachable", label: `Active (${counts.reachable})` },
              { key: "broken", label: `Broken (${counts.broken})` },
              { key: "saved", label: `Saved (${counts.saved})` },
              { key: "failed", label: `Failed (${counts.failed})` },
            ] as { key: FilterTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusTab(tab.key)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusTab === tab.key
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {searchQuery.trim() && (
            <span className="text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap shrink-0">
              {visibleAssets.length} matching
            </span>
          )}
          <div className="relative w-full sm:w-80">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by file name or style folder..."
              aria-label="Filter displayed assets by file name or style folder"
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600 focus:bg-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear filter text"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* High-Density Data Grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
              <th className="py-2.5 pl-5 pr-2 w-10">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={visibleAssets.length === 0}
                  onChange={(e) =>
                    onToggleSelectVisible(visibleIds, e.target.checked)
                  }
                  aria-label="Select all visible assets"
                  title={
                    allVisibleSelected
                      ? "Deselect all visible assets"
                      : "Select all visible assets"
                  }
                  className="w-3.5 h-3.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600 cursor-pointer disabled:opacity-40"
                />
              </th>
              <th className="py-2.5 px-2 w-14 font-mono">Row</th>
              <th className="py-2.5 px-3 w-12">Preview</th>
              <th className="py-2.5 px-3 min-w-[140px]">Style Folder</th>
              <th className="py-2.5 px-3 min-w-[180px]">Target File Name</th>
              <th className="py-2.5 px-3 min-w-[240px]">Shopify CDN Link</th>
              <th className="py-2.5 px-3 min-w-[170px]">Status</th>
              <th className="py-2.5 pl-3 pr-5 text-right min-w-[130px]">Dimensions / Size</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {visibleAssets.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 px-5 text-center text-slate-500">
                  {assets.length === 0
                    ? "No image links detected yet. Upload an Excel sheet or check your URL column mapping above."
                    : "No rows match the current filter."}
                </td>
              </tr>
            ) : (
              visibleAssets.slice(0, 500).map((asset) => {
                const isPreviewSelected = asset.id === previewAssetId;
                const isChecked = selectedIds.has(asset.id);
                const dupInfo = duplicateAnalysis.occurrenceById.get(asset.id);
                const isDuplicateRow =
                  assetViewMode === "all" && Boolean(dupInfo?.isDuplicateOccurrence);
                const isPrimaryWithDups =
                  assetViewMode === "all" &&
                  Boolean(dupInfo && !dupInfo.isDuplicateOccurrence);

                return (
                <tr
                  key={asset.id}
                  onClick={() => setPreviewAssetId(asset.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPreviewAssetId(asset.id);
                    }
                  }}
                  tabIndex={0}
                  className={`transition-colors h-[42px] cursor-pointer focus:outline-none focus-visible:bg-teal-50/70 ${
                    isPreviewSelected
                      ? "bg-teal-50/75"
                      : isChecked
                        ? "bg-slate-100/80 hover:bg-slate-100"
                        : asset.status === "broken"
                          ? "bg-red-50/45 hover:bg-red-50/75"
                          : isDuplicateRow
                            ? "bg-amber-50/75 hover:bg-amber-100/70"
                            : isPrimaryWithDups
                              ? "bg-amber-50/25 hover:bg-amber-50/50"
                              : "hover:bg-slate-50/80"
                  }`}
                >
                  <td
                    className="py-1.5 pl-5 pr-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleSelect(asset.id)}
                      aria-label={`Select ${asset.targetFileName}`}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600 cursor-pointer"
                    />
                  </td>

                  <td className="py-1.5 px-2 font-mono tabular-nums text-slate-400">
                    {asset.rowIndex}
                  </td>

                  <td
                    className="py-1.5 px-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewAssetId(null);
                        setFullScreenAssetId(asset.id);
                      }}
                      title="Open full-screen high-resolution preview (Original vs Converted)"
                      aria-label={`Open full-screen preview for ${asset.targetFileName}`}
                      className={`group relative w-7 h-7 rounded border overflow-hidden flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 cursor-zoom-in transition-shadow hover:ring-2 hover:ring-teal-600 ${
                        !asset.previewUrl && asset.status === "broken"
                          ? "border-red-200"
                          : isDuplicateRow
                            ? "border-amber-300"
                            : "border-slate-200"
                      }`}
                    >
                      {asset.previewUrl ? (
                        <>
                          <img
                            src={asset.previewUrl}
                            alt={asset.targetFileName}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover bg-slate-100"
                          />
                          <span className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/35 flex items-center justify-center transition-colors">
                            <Maximize2 className="w-3 h-3 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </span>
                        </>
                      ) : (
                        <div
                          className={`w-full h-full flex items-center justify-center ${
                            asset.status === "broken"
                              ? "bg-red-50 text-red-600"
                              : isDuplicateRow
                                ? "bg-amber-50 text-amber-600"
                                : "bg-slate-50 text-slate-400 group-hover:text-teal-700"
                          }`}
                        >
                          {asset.status === "broken" ? (
                            <Unlink className="w-3.5 h-3.5" />
                          ) : (
                            <ImageIcon className="w-3.5 h-3.5" />
                          )}
                        </div>
                      )}
                    </button>
                  </td>

                  <td
                    className="py-1.5 px-3 font-mono text-slate-800 max-w-[180px] truncate"
                    title={asset.styleFolder}
                  >
                    {asset.styleFolder}/
                  </td>

                  <td
                    className={`py-1.5 px-3 font-mono font-medium max-w-[260px] ${
                      asset.status === "broken"
                        ? "text-red-900 line-through decoration-red-400"
                        : isDuplicateRow
                          ? "text-amber-950"
                          : "text-slate-900"
                    }`}
                    title={
                      dupInfo && assetViewMode === "all"
                        ? dupInfo.isDuplicateOccurrence
                          ? `Duplicate filename of row #${dupInfo.primaryRowIndex} (${dupInfo.primaryFileName}) — ${asset.targetPath}`
                          : `Appears ${dupInfo.total} times — ${asset.targetPath}`
                        : asset.targetPath
                    }
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{asset.targetFileName}</span>
                      {dupInfo && assetViewMode === "all" && (
                        <span
                          className={`shrink-0 text-[10px] font-mono tabular-nums whitespace-nowrap ${
                            dupInfo.isDuplicateOccurrence
                              ? "text-amber-700 font-semibold"
                              : "text-amber-700/80"
                          }`}
                        >
                          {dupInfo.isDuplicateOccurrence
                            ? `DUP ${dupInfo.index}/${dupInfo.total}`
                            : `×${dupInfo.total}`}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-1.5 px-3 max-w-[300px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`font-mono text-[11px] truncate ${
                          asset.status === "broken" ? "text-red-700" : "text-slate-500"
                        }`}
                        title={asset.sourceUrl}
                      >
                        {asset.sourceUrl}
                      </span>
                      <a
                        href={asset.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Open ${asset.targetFileName} source link`}
                        className="text-slate-400 hover:text-slate-700 shrink-0"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </td>

                  <td className="py-1.5 px-3 whitespace-nowrap">
                    {asset.status === "ready" && (
                      <span className="inline-flex items-center gap-1.5 text-slate-600">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        Ready
                      </span>
                    )}
                    {asset.status === "validating" && (
                      <span className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-700" />
                        Checking
                      </span>
                    )}
                    {asset.status === "reachable" && (
                      <span className="inline-flex items-center gap-1.5 text-teal-700 font-medium">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Active
                      </span>
                    )}
                    {asset.status === "broken" && (
                      <span
                        className="inline-flex items-center gap-1.5 text-red-700 font-medium max-w-[210px] truncate"
                        title={asset.errorMessage || "Broken link"}
                      >
                        <Unlink className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          Broken · {asset.errorMessage || "Unreachable"}
                        </span>
                      </span>
                    )}
                    {asset.status === "fetching" && (
                      <span className="inline-flex items-center gap-1.5 text-teal-700 font-medium">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Fetching
                      </span>
                    )}
                    {asset.status === "saved" && (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Saved
                      </span>
                    )}
                    {asset.status === "failed" && (
                      <span
                        className="inline-flex items-center gap-1.5 text-red-700 font-medium max-w-[200px] truncate"
                        title={asset.errorMessage || "Failed"}
                      >
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {asset.errorMessage || "Failed"}
                        </span>
                      </span>
                    )}
                    {asset.status === "skipped" && (
                      <span className="text-slate-400">Skipped (duplicate)</span>
                    )}
                  </td>

                  <td className="py-1.5 pl-3 pr-5 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                    {asset.imageWidth && asset.imageHeight
                      ? `${asset.imageWidth}×${asset.imageHeight} · ${formatBytes(asset.byteSize)}`
                      : formatBytes(asset.byteSize)}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>

        {visibleAssets.length > 500 && (
          <div className="px-5 py-2.5 border-t border-slate-100 text-xs text-slate-500 bg-slate-50 font-mono tabular-nums">
            Showing first 500 of {visibleAssets.length} matching rows. All rows will still be processed and packaged in your ZIP export.
          </div>
        )}
      </div>

      <ImagePreviewPanel
        asset={activePreviewAsset}
        currentIndex={previewIndex}
        totalCount={visibleAssets.length}
        onClose={() => setPreviewAssetId(null)}
        onExpandFullScreen={() => {
          if (activePreviewAsset) {
            const id = activePreviewAsset.id;
            setPreviewAssetId(null);
            setFullScreenAssetId(id);
          }
        }}
        onPrevious={() => {
          if (previewIndex > 0) {
            setPreviewAssetId(visibleAssets[previewIndex - 1].id);
          }
        }}
        onNext={() => {
          if (previewIndex >= 0 && previewIndex < visibleAssets.length - 1) {
            setPreviewAssetId(visibleAssets[previewIndex + 1].id);
          }
        }}
      />

      <FullScreenPreviewModal
        asset={activeFullScreenAsset}
        currentIndex={fullScreenIndex}
        totalCount={visibleAssets.length}
        mapping={mapping}
        onClose={() => setFullScreenAssetId(null)}
        onPrevious={() => {
          if (fullScreenIndex > 0) {
            setFullScreenAssetId(visibleAssets[fullScreenIndex - 1].id);
          }
        }}
        onNext={() => {
          if (fullScreenIndex >= 0 && fullScreenIndex < visibleAssets.length - 1) {
            setFullScreenAssetId(visibleAssets[fullScreenIndex + 1].id);
          }
        }}
      />

      <BulkRenameModal
        isOpen={showBulkRenameModal}
        allAssets={assets}
        selectedAssets={selectedAssetsInOrder}
        rootFolderName={mapping.rootFolderName}
        onClose={() => setShowBulkRenameModal(false)}
        onApply={onBulkRename}
      />
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { FolderTreeSidebar } from "./components/FolderTreeSidebar.tsx";
import { UploadZone } from "./components/UploadZone.tsx";
import { ColumnMapper } from "./components/ColumnMapper.tsx";
import { AssetQueueTable } from "./components/AssetQueueTable.tsx";
import {
  BatchSummaryPanel,
  type BatchProgressState,
} from "./components/BatchSummaryPanel.tsx";
import type {
  AssetStatus,
  AssetViewMode,
  DuplicateMatchScope,
  MappingConfig,
  PlannedAsset,
  WorkbookData,
} from "./types/asset.ts";
import type { BulkRenamePreviewItem } from "./utils/bulkRename.ts";
import {
  downloadSampleExcelTemplate,
  inferColumnMapping,
  parseSpreadsheetFile,
} from "./utils/excelParser.ts";
import {
  analyzeDuplicateFilenames,
  buildPlannedAssets,
  buildTargetPath,
  groupAssetsByFolder,
  resolveUniqueFileStem,
  retargetQueueExtension,
  sanitizeSegment,
  splitNameAndExtension,
} from "./utils/fileNaming.ts";
import {
  applyDetectedExtensionToPath,
  convertSavedAsset,
  exportAssetsAsZip,
  exportManifestCsv,
  fetchSingleAsset,
  saveAssetsToLocalFolder,
  supportsLocalDirectoryPicker,
  validateSingleAsset,
} from "./utils/packager.ts";

import {
  clearSessionState,
  DEFAULT_MAPPING_CONFIG,
  loadSessionState,
  saveSessionState,
  type RestoredSession,
} from "./utils/sessionStorage.ts";

interface NoticeState {
  type: "success" | "error" | "info";
  message: string;
}

function buildRestoredNotice(restored: RestoredSession | null): NoticeState | null {
  if (!restored) return null;
  if (restored.restoredFromSavedCount > 0) {
    return {
      type: "info",
      message: `Restored your saved session (${restored.assets.length} queued items). ${restored.restoredFromSavedCount} previously downloaded image${
        restored.restoredFromSavedCount === 1 ? " was" : "s were"
      } marked reachable — click Fetch All Images to re-download before exporting.`,
    };
  }
  return {
    type: "info",
    message: `Restored your saved workspace${
      restored.workbook ? ` (${restored.workbook.fileName})` : ""
    } from local auto-save.`,
  };
}

export default function App() {
  const [initialSession] = useState<RestoredSession | null>(() =>
    loadSessionState()
  );

  const [workbook, setWorkbook] = useState<WorkbookData | null>(
    () => initialSession?.workbook ?? null
  );
  const [activeSheetIndex, setActiveSheetIndex] = useState(
    () => initialSession?.activeSheetIndex ?? 0
  );
  const [mapping, setMapping] = useState<MappingConfig>(
    () => initialSession?.mapping ?? DEFAULT_MAPPING_CONFIG
  );

  const [assets, setAssets] = useState<PlannedAsset[]>(
    () => initialSession?.assets ?? []
  );
  const [selectedFolder, setSelectedFolder] = useState<string | null>(
    () => initialSession?.selectedFolder ?? null
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => initialSession?.selectedIds ?? new Set()
  );
  const [assetViewMode, setAssetViewMode] = useState<AssetViewMode>(
    () => initialSession?.assetViewMode ?? "all"
  );
  const [duplicateMatchScope, setDuplicateMatchScope] = useState<DuplicateMatchScope>(
    () => initialSession?.duplicateMatchScope ?? "filename"
  );
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [notice, setNotice] = useState<NoticeState | null>(() =>
    buildRestoredNotice(initialSession)
  );
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(
    () => initialSession?.savedAt ?? null
  );
  const [autoSaveQuotaExceeded, setAutoSaveQuotaExceeded] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgressState>({
    mode: null,
    startedAt: null,
    completedCount: 0,
    totalCount: 0,
    lastDurationMs: null,
    lastMode: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const validateAbortRef = useRef<AbortController | null>(null);
  const convertAbortRef = useRef<AbortController | null>(null);
  const assetsRef = useRef<PlannedAsset[]>([]);
  assetsRef.current = assets;
  const isDirtyRef = useRef(false);
  const hasMountedRef = useRef(false);
  const latestSessionRef = useRef({
    workbook,
    activeSheetIndex,
    mapping,
    assets,
    selectedFolder,
    selectedIds,
    assetViewMode,
    duplicateMatchScope,
  });

  const activeSheet = workbook?.sheets[activeSheetIndex] ?? null;

  const revokeAllPreviewUrls = (list: PlannedAsset[]) => {
    for (const item of list) {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    }
  };

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      validateAbortRef.current?.abort();
      convertAbortRef.current?.abort();
      revokeAllPreviewUrls(assetsRef.current);
    };
  }, []);

  // Keep latest state ref synced and trigger debounced auto-save on state changes
  useEffect(() => {
    latestSessionRef.current = {
      workbook,
      activeSheetIndex,
      mapping,
      assets,
      selectedFolder,
      selectedIds,
      assetViewMode,
      duplicateMatchScope,
    };

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    if (!workbook && assets.length === 0) {
      isDirtyRef.current = false;
      clearSessionState();
      setLastSavedAt(null);
      setAutoSaveQuotaExceeded(false);
      return;
    }

    isDirtyRef.current = true;
    const debounceId = window.setTimeout(() => {
      if (!isDirtyRef.current) return;
      const result = saveSessionState(latestSessionRef.current);
      if (result.ok) {
        isDirtyRef.current = false;
        setLastSavedAt(result.savedAt);
        setAutoSaveQuotaExceeded(false);
      } else if (result.reason === "quota") {
        isDirtyRef.current = false;
        setAutoSaveQuotaExceeded(true);
      }
    }, 1000);

    return () => {
      window.clearTimeout(debounceId);
    };
  }, [
    workbook,
    activeSheetIndex,
    mapping,
    assets,
    selectedFolder,
    selectedIds,
    assetViewMode,
    duplicateMatchScope,
  ]);

  // Periodic 5-second auto-save interval + flush before page unload / tab hide
  useEffect(() => {
    const flushIfDirty = () => {
      if (!isDirtyRef.current) return;
      const current = latestSessionRef.current;
      if (!current.workbook && current.assets.length === 0) return;

      const result = saveSessionState(current);
      if (result.ok) {
        isDirtyRef.current = false;
        setLastSavedAt(result.savedAt);
        setAutoSaveQuotaExceeded(false);
      } else if (result.reason === "quota") {
        isDirtyRef.current = false;
        setAutoSaveQuotaExceeded(true);
      }
    };

    const intervalId = window.setInterval(flushIfDirty, 5000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushIfDirty();
      }
    };

    window.addEventListener("beforeunload", flushIfDirty);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("beforeunload", flushIfDirty);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Recompute planned assets whenever sheet or column mapping changes (when not actively fetching)
  const rebuildQueue = (sheet: WorkbookData["sheets"][number] | null, nextConfig: MappingConfig) => {
    revokeAllPreviewUrls(assetsRef.current);
    if (!sheet) {
      setAssets([]);
      return;
    }
    const planned = buildPlannedAssets(sheet, nextConfig);
    setAssets(planned);
    setSelectedFolder(null);
    setSelectedIds(new Set());
    setBatchProgress({
      mode: null,
      startedAt: null,
      completedCount: 0,
      totalCount: 0,
      lastDurationMs: null,
      lastMode: null,
    });
  };

  const handleClearSession = () => {
    if (isValidating || isFetching || isConverting || isZipping) return;
    revokeAllPreviewUrls(assetsRef.current);
    isDirtyRef.current = false;
    clearSessionState();
    setWorkbook(null);
    setActiveSheetIndex(0);
    setMapping(DEFAULT_MAPPING_CONFIG);
    setAssets([]);
    setSelectedFolder(null);
    setSelectedIds(new Set());
    setAssetViewMode("all");
    setParseError(null);
    setNotice(null);
    setLastSavedAt(null);
    setAutoSaveQuotaExceeded(false);
    setBatchProgress({
      mode: null,
      startedAt: null,
      completedCount: 0,
      totalCount: 0,
      lastDurationMs: null,
      lastMode: null,
    });
  };

  const handleFileSelected = async (file: File) => {
    if (isValidating) {
      validateAbortRef.current?.abort();
      setIsValidating(false);
    }
    if (isFetching) {
      abortControllerRef.current?.abort();
      setIsFetching(false);
    }
    if (isConverting) {
      convertAbortRef.current?.abort();
      setIsConverting(false);
    }

    setIsParsing(true);
    setParseError(null);
    setNotice(null);

    try {
      const parsed = await parseSpreadsheetFile(file);
      if (parsed.sheets.length === 0) {
        setParseError("No readable columns or rows found in this spreadsheet.");
        setIsParsing(false);
        return;
      }

      const firstSheet = parsed.sheets[0];
      const inferred = inferColumnMapping(firstSheet, parsed.fileName);

      setWorkbook(parsed);
      setActiveSheetIndex(0);
      setMapping(inferred);
      rebuildQueue(firstSheet, inferred);
    } catch (err: unknown) {
      setParseError(
        err instanceof Error ? err.message : "Unable to read spreadsheet file."
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handlePasteRows = (rawText: string) => {
    if (isValidating) {
      validateAbortRef.current?.abort();
      setIsValidating(false);
    }
    if (isFetching) {
      abortControllerRef.current?.abort();
      setIsFetching(false);
    }
    if (isConverting) {
      convertAbortRef.current?.abort();
      setIsConverting(false);
    }

    setParseError(null);
    setNotice(null);

    try {
      const wb = XLSX.read(rawText, { type: "string" });
      const firstName = wb.SheetNames[0];
      const ws = wb.Sheets[firstName];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        raw: false,
        defval: "",
      });

      const headerIdx = matrix.findIndex(
        (r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim().length > 0)
      );
      if (headerIdx === -1) {
        setParseError("Pasted text did not contain a recognizable header row.");
        return;
      }

      const headers = (matrix[headerIdx] as unknown[]).map(
        (c, i) => String(c ?? "").trim() || `Column ${i + 1}`
      );
      const rows: Record<string, string>[] = [];
      for (let i = headerIdx + 1; i < matrix.length; i++) {
        const rawRow = matrix[i];
        if (!Array.isArray(rawRow)) continue;
        const record: Record<string, string> = {};
        let nonEmpty = false;
        headers.forEach((h, idx) => {
          const val = String(rawRow[idx] ?? "").trim();
          if (val) nonEmpty = true;
          record[h] = val;
        });
        if (nonEmpty) rows.push(record);
      }

      const sheet = { name: "Pasted_Sheet", headers, rows };
      const parsedWorkbook: WorkbookData = {
        fileName: "pasted_shopify_links.xlsx",
        sheets: [sheet],
      };
      const inferred = inferColumnMapping(sheet, parsedWorkbook.fileName);

      setWorkbook(parsedWorkbook);
      setActiveSheetIndex(0);
      setMapping(inferred);
      rebuildQueue(sheet, inferred);
    } catch (err: unknown) {
      setParseError(
        err instanceof Error ? err.message : "Could not parse pasted rows."
      );
    }
  };

  const handleSelectSheet = (index: number) => {
    if (!workbook || isFetching || isValidating || isConverting) return;
    const targetSheet = workbook.sheets[index];
    if (!targetSheet) return;
    const inferred = inferColumnMapping(targetSheet, workbook.fileName);
    setActiveSheetIndex(index);
    setMapping(inferred);
    rebuildQueue(targetSheet, inferred);
  };

  const handleMappingChange = (nextConfig: MappingConfig) => {
    const affectsQueuePlan =
      nextConfig.styleColumn !== mapping.styleColumn ||
      nextConfig.fileNameColumn !== mapping.fileNameColumn ||
      nextConfig.rootFolderName !== mapping.rootFolderName ||
      nextConfig.splitMultiUrls !== mapping.splitMultiUrls ||
      nextConfig.duplicatePolicy !== mapping.duplicatePolicy ||
      nextConfig.defaultFolderName !== mapping.defaultFolderName ||
      nextConfig.urlColumns.length !== mapping.urlColumns.length ||
      nextConfig.urlColumns.some((col, i) => col !== mapping.urlColumns[i]);

    const transformChanged =
      nextConfig.outputFormat !== mapping.outputFormat ||
      nextConfig.outputQuality !== mapping.outputQuality ||
      nextConfig.resizeEnabled !== mapping.resizeEnabled ||
      nextConfig.targetWidth !== mapping.targetWidth ||
      nextConfig.targetHeight !== mapping.targetHeight ||
      nextConfig.resizeFit !== mapping.resizeFit ||
      nextConfig.backgroundColor !== mapping.backgroundColor;

    setMapping(nextConfig);
    if (affectsQueuePlan) {
      rebuildQueue(activeSheet, nextConfig);
      return;
    }

    if (transformChanged) {
      const hasActiveTransform =
        nextConfig.outputFormat !== "original" || nextConfig.resizeEnabled;
      setAssets((prev) => {
        const retargeted = retargetQueueExtension(prev, nextConfig);
        return retargeted.map((item) =>
          item.status === "saved" && item.blob
            ? { ...item, needsTransform: hasActiveTransform }
            : item
        );
      });
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectVisible = (visibleIds: string[], selectAll: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selectAll) {
        for (const id of visibleIds) next.add(id);
      } else {
        for (const id of visibleIds) next.delete(id);
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const duplicateAnalysis = useMemo(
    () => analyzeDuplicateFilenames(assets, duplicateMatchScope),
    [assets, duplicateMatchScope]
  );

  const effectiveAssets = useMemo(
    () =>
      assetViewMode === "unique"
        ? assets.filter((a) => !duplicateAnalysis.duplicateIds.has(a.id))
        : assets,
    [assets, assetViewMode, duplicateAnalysis.duplicateIds]
  );

  const runBatchValidate = async (targetStatuses: AssetStatus[]) => {
    if (isValidating || isFetching || isConverting) return;

    const basePool =
      assetViewMode === "unique"
        ? assetsRef.current.filter((a) => !duplicateAnalysis.duplicateIds.has(a.id))
        : assetsRef.current;

    const pool =
      selectedIds.size > 0
        ? basePool.filter((a) => selectedIds.has(a.id))
        : basePool;

    const queue = pool.filter((a) => targetStatuses.includes(a.status));
    if (queue.length === 0) return;

    const controller = new AbortController();
    validateAbortRef.current = controller;
    const batchStartedAt = Date.now();
    setIsValidating(true);
    setNotice(null);
    setBatchProgress((prev) => ({
      ...prev,
      mode: "validating",
      startedAt: batchStartedAt,
      completedCount: 0,
      totalCount: queue.length,
    }));

    let cursor = 0;
    let activeCount = 0;
    let brokenCount = 0;
    const concurrency = 8;

    const worker = async () => {
      while (!controller.signal.aborted) {
        const idx = cursor++;
        if (idx >= queue.length) break;

        const targetAsset = queue[idx];
        const previousStatus = targetAsset.status;

        setAssets((prev) =>
          prev.map((item) =>
            item.id === targetAsset.id
              ? { ...item, status: "validating", errorMessage: undefined }
              : item
          )
        );

        const result = await validateSingleAsset(
          targetAsset,
          mapping.stripShopifyResizeParams,
          controller.signal
        );

        if (controller.signal.aborted) {
          setAssets((prev) =>
            prev.map((item) =>
              item.id === targetAsset.id && item.status === "validating"
                ? { ...item, status: previousStatus }
                : item
            )
          );
          break;
        }

        if (result.valid) {
          activeCount++;
          const updatedPaths = applyDetectedExtensionToPath(
            targetAsset,
            result.detectedExtension || targetAsset.plannedExtension,
            mapping
          );
          setAssets((prev) =>
            prev.map((item) =>
              item.id === targetAsset.id
                ? {
                    ...item,
                    status: "reachable",
                    httpStatus: result.status,
                    contentType: result.contentType,
                    byteSize: result.contentLength ?? item.byteSize,
                    detectedExtension: result.detectedExtension,
                    targetFileName: updatedPaths.targetFileName,
                    targetPath: updatedPaths.targetPath,
                    plannedExtension: updatedPaths.plannedExtension,
                    errorMessage: undefined,
                  }
                : item
            )
          );
        } else {
          brokenCount++;
          setAssets((prev) =>
            prev.map((item) =>
              item.id === targetAsset.id
                ? {
                    ...item,
                    status: "broken",
                    httpStatus: result.status,
                    errorMessage: result.errorMessage || "Unreachable link",
                  }
                : item
            )
          );
        }

        setBatchProgress((prev) => ({
          ...prev,
          completedCount: prev.completedCount + 1,
        }));
      }
    };

    try {
      await Promise.all(
        Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
      );

      if (!controller.signal.aborted) {
        if (brokenCount > 0) {
          setNotice({
            type: "info",
            message: `Validation complete: ${activeCount} active image links ready for bulk download, ${brokenCount} broken links marked in queue.`,
          });
        } else {
          setNotice({
            type: "success",
            message: `Validation complete: All ${activeCount} Shopify CDN links are active and reachable.`,
          });
        }
      }
    } finally {
      const durationMs = Date.now() - batchStartedAt;
      setIsValidating(false);
      validateAbortRef.current = null;
      setBatchProgress((prev) => ({
        ...prev,
        mode: null,
        startedAt: null,
        lastDurationMs: durationMs,
        lastMode: "validating",
      }));
    }
  };

  const handlePauseValidation = () => {
    validateAbortRef.current?.abort();
  };

  const runBatchFetch = async (targetStatuses: AssetStatus[]) => {
    if (isFetching || isValidating || isConverting) return;

    const basePool =
      assetViewMode === "unique"
        ? assetsRef.current.filter((a) => !duplicateAnalysis.duplicateIds.has(a.id))
        : assetsRef.current;

    const pool =
      selectedIds.size > 0
        ? basePool.filter((a) => selectedIds.has(a.id))
        : basePool;

    const queue = pool.filter((a) => targetStatuses.includes(a.status));
    if (queue.length === 0) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const batchStartedAt = Date.now();
    setIsFetching(true);
    setNotice(null);
    setBatchProgress((prev) => ({
      ...prev,
      mode: "fetching",
      startedAt: batchStartedAt,
      completedCount: 0,
      totalCount: queue.length,
    }));

    let cursor = 0;
    const concurrency = Math.max(1, Math.min(mapping.concurrency, 8));
    const delayMs = Math.max(0, mapping.downloadDelayMs || 0);
    let nextDispatchAt = 0;

    const waitForDispatchSlot = (signal: AbortSignal): Promise<boolean> => {
      if (delayMs <= 0) return Promise.resolve(!signal.aborted);
      const now = Date.now();
      const scheduledAt = Math.max(now, nextDispatchAt);
      nextDispatchAt = scheduledAt + delayMs;
      const waitMs = scheduledAt - now;
      if (waitMs <= 0) return Promise.resolve(!signal.aborted);

      return new Promise((resolve) => {
        const onAbort = () => {
          clearTimeout(timerId);
          signal.removeEventListener("abort", onAbort);
          resolve(false);
        };
        const timerId = setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          resolve(!signal.aborted);
        }, waitMs);
        signal.addEventListener("abort", onAbort, { once: true });
      });
    };

    const worker = async () => {
      while (!controller.signal.aborted) {
        const idx = cursor++;
        if (idx >= queue.length) break;

        const targetAsset = queue[idx];

        const allowed = await waitForDispatchSlot(controller.signal);
        if (!allowed) break;

        setAssets((prev) =>
          prev.map((item) =>
            item.id === targetAsset.id
              ? { ...item, status: "fetching", errorMessage: undefined }
              : item
          )
        );

        const result = await fetchSingleAsset(
          targetAsset,
          mapping,
          controller.signal
        );

        if (controller.signal.aborted) {
          setAssets((prev) =>
            prev.map((item) =>
              item.id === targetAsset.id && item.status === "fetching"
                ? { ...item, status: targetAsset.status === "reachable" ? "reachable" : "ready" }
                : item
            )
          );
          break;
        }

        if (result.ok && result.blob) {
          const updatedPaths = applyDetectedExtensionToPath(
            targetAsset,
            result.detectedExtension || targetAsset.plannedExtension,
            mapping
          );
          setAssets((prev) =>
            prev.map((item) => {
              if (item.id !== targetAsset.id) return item;
              if (item.previewUrl && item.previewUrl !== result.previewUrl) {
                URL.revokeObjectURL(item.previewUrl);
              }
              return {
                ...item,
                status: "saved",
                blob: result.blob,
                previewUrl: result.previewUrl,
                byteSize: result.byteSize,
                contentType: result.contentType,
                detectedExtension: result.detectedExtension,
                imageWidth: result.imageWidth,
                imageHeight: result.imageHeight,
                needsTransform: false,
                targetFileName: updatedPaths.targetFileName,
                targetPath: updatedPaths.targetPath,
                plannedExtension: updatedPaths.plannedExtension,
                errorMessage: undefined,
              };
            })
          );
        } else {
          setAssets((prev) =>
            prev.map((item) =>
              item.id === targetAsset.id
                ? {
                    ...item,
                    status: "failed",
                    errorMessage: result.errorMessage || "Download failed",
                  }
                : item
            )
          );
        }

        setBatchProgress((prev) => ({
          ...prev,
          completedCount: prev.completedCount + 1,
        }));
      }
    };

    try {
      await Promise.all(
        Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
      );
    } finally {
      const durationMs = Date.now() - batchStartedAt;
      setIsFetching(false);
      abortControllerRef.current = null;
      setBatchProgress((prev) => ({
        ...prev,
        mode: null,
        startedAt: null,
        lastDurationMs: durationMs,
        lastMode: "fetching",
      }));
    }
  };

  const handlePauseFetch = () => {
    abortControllerRef.current?.abort();
  };

  const runBatchConvert = async () => {
    if (isConverting || isFetching || isValidating) return;

    const basePool =
      assetViewMode === "unique"
        ? assetsRef.current.filter((a) => !duplicateAnalysis.duplicateIds.has(a.id))
        : assetsRef.current;

    const pool =
      selectedIds.size > 0
        ? basePool.filter((a) => selectedIds.has(a.id))
        : basePool;

    const savedWithBlobs = pool.filter(
      (a) => a.status === "saved" && Boolean(a.blob)
    );
    const pendingTransform = savedWithBlobs.filter((a) => a.needsTransform);
    const queue = pendingTransform.length > 0 ? pendingTransform : savedWithBlobs;
    if (queue.length === 0) return;

    const controller = new AbortController();
    convertAbortRef.current = controller;
    const batchStartedAt = Date.now();
    setIsConverting(true);
    setNotice(null);
    setBatchProgress((prev) => ({
      ...prev,
      mode: "converting",
      startedAt: batchStartedAt,
      completedCount: 0,
      totalCount: queue.length,
    }));

    let cursor = 0;
    let convertedCount = 0;
    let errorCount = 0;
    const concurrency = 4;

    const worker = async () => {
      while (!controller.signal.aborted) {
        const idx = cursor++;
        if (idx >= queue.length) break;

        const targetAsset = queue[idx];
        const result = await convertSavedAsset(
          targetAsset,
          mapping,
          controller.signal
        );

        if (controller.signal.aborted) {
          if (result.previewUrl) {
            URL.revokeObjectURL(result.previewUrl);
          }
          break;
        }

        if (result.ok && result.blob) {
          convertedCount++;
          const updatedPaths = applyDetectedExtensionToPath(
            targetAsset,
            result.detectedExtension || targetAsset.plannedExtension,
            mapping
          );
          setAssets((prev) =>
            prev.map((item) => {
              if (item.id !== targetAsset.id) return item;
              if (item.previewUrl && item.previewUrl !== result.previewUrl) {
                URL.revokeObjectURL(item.previewUrl);
              }
              return {
                ...item,
                blob: result.blob,
                previewUrl: result.previewUrl,
                byteSize: result.byteSize,
                contentType: result.contentType,
                detectedExtension: result.detectedExtension,
                imageWidth: result.imageWidth,
                imageHeight: result.imageHeight,
                needsTransform: false,
                targetFileName: updatedPaths.targetFileName,
                targetPath: updatedPaths.targetPath,
                plannedExtension: updatedPaths.plannedExtension,
                errorMessage: undefined,
              };
            })
          );
        } else {
          errorCount++;
          setAssets((prev) =>
            prev.map((item) =>
              item.id === targetAsset.id
                ? {
                    ...item,
                    errorMessage: result.errorMessage || "Conversion failed",
                  }
                : item
            )
          );
        }

        setBatchProgress((prev) => ({
          ...prev,
          completedCount: prev.completedCount + 1,
        }));
      }
    };

    try {
      await Promise.all(
        Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
      );

      if (!controller.signal.aborted) {
        const formatLabel =
          mapping.outputFormat === "original"
            ? "original format"
            : mapping.outputFormat.toUpperCase();
        const dimLabel =
          mapping.resizeEnabled && (mapping.targetWidth || mapping.targetHeight)
            ? ` at ${mapping.targetWidth ?? "auto"}×${mapping.targetHeight ?? "auto"} px`
            : "";

        setNotice({
          type: errorCount > 0 ? "info" : "success",
          message:
            errorCount > 0
              ? `Converted ${convertedCount} images to ${formatLabel}${dimLabel} (${errorCount} could not be converted).`
              : `Converted ${convertedCount} saved images to ${formatLabel}${dimLabel}. Ready for ZIP or folder export.`,
        });
      }
    } finally {
      const durationMs = Date.now() - batchStartedAt;
      setIsConverting(false);
      convertAbortRef.current = null;
      setBatchProgress((prev) => ({
        ...prev,
        mode: null,
        startedAt: null,
        lastDurationMs: durationMs,
        lastMode: "converting",
      }));
    }
  };

  const handlePauseConvert = () => {
    convertAbortRef.current?.abort();
  };

  const handleExportZip = async () => {
    setIsZipping(true);
    setZipProgress(0);
    setNotice(null);
    try {
      const targetAssets =
        selectedIds.size > 0
          ? effectiveAssets.filter((a) => selectedIds.has(a.id))
          : effectiveAssets;
      const zipName =
        mapping.rootFolderName.trim() ||
        workbook?.fileName.replace(/\.(xlsx|xls|csv)$/i, "") ||
        "shopify_style_images";
      const count = await exportAssetsAsZip(targetAssets, zipName, setZipProgress);
      const styleCount = new Set(
        targetAssets.filter((a) => a.status === "saved").map((a) => a.styleFolder)
      ).size;
      setNotice({
        type: "success",
        message: `Downloaded ${zipName}.zip containing ${count} images organized into ${styleCount} style folders.`,
      });
    } catch (err: unknown) {
      setNotice({
        type: "error",
        message:
          err instanceof Error ? err.message : "Failed to create ZIP archive.",
      });
    } finally {
      setIsZipping(false);
    }
  };

  const handleSaveToFolder = async () => {
    setNotice(null);
    try {
      const targetAssets =
        selectedIds.size > 0
          ? effectiveAssets.filter((a) => selectedIds.has(a.id))
          : effectiveAssets;
      const written = await saveAssetsToLocalFolder(targetAssets);
      setNotice({
        type: "success",
        message: `Saved ${written} image files into their style-wise folders inside your selected directory.`,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Unable to write to local folder.";
      // User cancelled picker cleanly
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setNotice({
        type: "info",
        message: `${msg} You can always use Download ZIP to export all folders cleanly.`,
      });
    }
  };

  const handleExportCsv = () => {
    const targetAssets =
      selectedIds.size > 0
        ? effectiveAssets.filter((a) => selectedIds.has(a.id))
        : effectiveAssets;
    const base =
      mapping.rootFolderName.trim() ||
      workbook?.fileName.replace(/\.(xlsx|xls|csv)$/i, "") ||
      "shopify_assets";
    exportManifestCsv(targetAssets, base);
  };

  const handleRenameFolder = (oldName: string, rawNewName: string) => {
    const newName = sanitizeSegment(rawNewName, oldName);
    if (!newName || newName === oldName) return;

    setAssets((prev) => {
      const next = [...prev];
      for (let i = 0; i < next.length; i++) {
        const item = next[i];
        if (item.styleFolder !== oldName) continue;

        const excludeIds = new Set<string>([item.id]);
        const uniqueStem = resolveUniqueFileStem(
          next,
          newName,
          item.sanitizedBaseName,
          item.plannedExtension,
          excludeIds
        );
        const targetFileName = `${uniqueStem}${item.plannedExtension}`;
        next[i] = {
          ...item,
          styleFolder: newName,
          sanitizedBaseName: uniqueStem,
          targetFileName,
          targetPath: buildTargetPath(
            mapping.rootFolderName,
            newName,
            targetFileName
          ),
        };
      }
      return next;
    });

    if (selectedFolder === oldName) {
      setSelectedFolder(newName);
    }
  };

  const handleRenameFile = (assetId: string, rawNewFileName: string) => {
    const trimmed = rawNewFileName.trim();
    if (!trimmed) return;

    setAssets((prev) => {
      const targetIndex = prev.findIndex((a) => a.id === assetId);
      if (targetIndex === -1) return prev;

      const target = prev[targetIndex];
      const { baseName, explicitExt } = splitNameAndExtension(trimmed);
      const nextExt = explicitExt ?? target.plannedExtension;
      const excludeIds = new Set<string>([assetId]);
      const uniqueStem = resolveUniqueFileStem(
        prev,
        target.styleFolder,
        baseName,
        nextExt,
        excludeIds
      );
      const targetFileName = `${uniqueStem}${nextExt}`;

      const next = [...prev];
      next[targetIndex] = {
        ...target,
        rawFileName: trimmed,
        sanitizedBaseName: uniqueStem,
        duplicateOriginStem: undefined,
        plannedExtension: nextExt,
        targetFileName,
        targetPath: buildTargetPath(
          mapping.rootFolderName,
          target.styleFolder,
          targetFileName
        ),
      };
      return next;
    });
  };

  const handleBulkRename = (items: BulkRenamePreviewItem[]) => {
    const updatesById = new Map<string, BulkRenamePreviewItem>();
    let changedCount = 0;
    for (const item of items) {
      if (item.changed) changedCount++;
      updatesById.set(item.assetId, item);
    }
    if (changedCount === 0) return;

    setAssets((prev) =>
      prev.map((asset) => {
        const update = updatesById.get(asset.id);
        if (!update || !update.changed) return asset;
        const extChangedOnSaved =
          asset.status === "saved" &&
          Boolean(asset.blob) &&
          update.newExtension !== asset.plannedExtension;
        return {
          ...asset,
          rawFileName: update.newFileName,
          sanitizedBaseName: update.newBaseName,
          duplicateOriginStem: undefined,
          plannedExtension: update.newExtension,
          targetFileName: update.newFileName,
          targetPath: update.newTargetPath,
          needsTransform: extChangedOnSaved ? true : asset.needsTransform,
        };
      })
    );

    setNotice({
      type: "success",
      message: `Bulk renamed ${changedCount} selected ${changedCount === 1 ? "asset" : "assets"}.`,
    });
  };

  const handleMoveFile = (assetId: string, rawTargetFolder: string) => {
    const targetFolder = sanitizeSegment(rawTargetFolder, "");
    if (!targetFolder) return;

    setAssets((prev) => {
      const targetIndex = prev.findIndex((a) => a.id === assetId);
      if (targetIndex === -1) return prev;

      const target = prev[targetIndex];
      if (target.styleFolder === targetFolder) return prev;

      const excludeIds = new Set<string>([assetId]);
      const uniqueStem = resolveUniqueFileStem(
        prev,
        targetFolder,
        target.sanitizedBaseName,
        target.plannedExtension,
        excludeIds
      );
      const targetFileName = `${uniqueStem}${target.plannedExtension}`;

      const next = [...prev];
      next[targetIndex] = {
        ...target,
        styleFolder: targetFolder,
        sanitizedBaseName: uniqueStem,
        duplicateOriginStem: undefined,
        targetFileName,
        targetPath: buildTargetPath(
          mapping.rootFolderName,
          targetFolder,
          targetFileName
        ),
      };
      return next;
    });
  };

  const folders = useMemo(
    () => groupAssetsByFolder(effectiveAssets),
    [effectiveAssets]
  );
  const folderSaveSupported = useMemo(() => supportsLocalDirectoryPicker(), []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-8">
        <a
          href="#upload-section"
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          StyleVault
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a
            href="#upload-section"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Upload Sheet
          </a>
          <a
            href="#mapping-section"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Column Mapping
          </a>
          <a
            href="#folder-sidebar"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Folder Tree
          </a>
          <a
            href="#queue-section"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Export Queue
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={downloadSampleExcelTemplate}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Download Template
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-[1600px] w-full mx-auto">
        <div id="folder-sidebar" className="lg:flex">
          <FolderTreeSidebar
            rootFolderName={mapping.rootFolderName}
            folders={folders}
            selectedFolder={selectedFolder}
            onSelectFolder={setSelectedFolder}
            totalFiles={effectiveAssets.length}
            disabled={isFetching || isValidating || isConverting || isZipping}
            onRenameFolder={handleRenameFolder}
            onRenameFile={handleRenameFile}
            onMoveFile={handleMoveFile}
          />
        </div>

        <main className="flex-1 min-w-0 p-5 lg:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 [text-wrap:balance]">
                Shopify CDN Excel Image Organizer
              </h1>
              <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                Upload an Excel or CSV sheet with style codes, target filenames, and Shopify CDN links to fetch every image and store it in style-wise folders.
              </p>
            </div>

            {(assets.length > 0 || lastSavedAt !== null || autoSaveQuotaExceeded) && (
              <div className="text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap shrink-0">
                {assets.length > 0 && (
                  <>
                    <span>{folders.length} style folders</span>
                    <span aria-hidden="true"> · </span>
                    <span>{assets.length} image links</span>
                  </>
                )}
                {autoSaveQuotaExceeded ? (
                  <>
                    {assets.length > 0 && <span aria-hidden="true"> · </span>}
                    <span className="text-amber-700">
                      Auto-save skipped (storage quota full)
                    </span>
                  </>
                ) : (
                  lastSavedAt !== null && (
                    <>
                      {assets.length > 0 && <span aria-hidden="true"> · </span>}
                      <span>
                        Auto-saved{" "}
                        {new Date(lastSavedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </>
                  )
                )}
              </div>
            )}
          </div>

          {notice && (
            <div
              className={`px-4 py-3 rounded-md border text-xs flex items-center justify-between gap-4 ${
                notice.type === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : notice.type === "error"
                    ? "bg-red-50 border-red-200 text-red-900"
                    : "bg-slate-100 border-slate-300 text-slate-800"
              }`}
            >
              <span>{notice.message}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="font-medium underline shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          <UploadZone
            workbook={workbook}
            activeSheetIndex={activeSheetIndex}
            onSelectSheet={handleSelectSheet}
            onFileSelected={handleFileSelected}
            onPasteRows={handlePasteRows}
            onClearSession={handleClearSession}
            disabled={isFetching || isValidating || isConverting || isZipping}
            isParsing={isParsing}
            parseError={parseError}
          />

          {activeSheet && (
            <>
              <ColumnMapper
                headers={activeSheet.headers}
                config={mapping}
                onChange={handleMappingChange}
                disabled={isFetching || isValidating || isConverting}
              />

              <BatchSummaryPanel
                assets={effectiveAssets}
                selectedIds={selectedIds}
                isValidating={isValidating}
                isFetching={isFetching}
                isConverting={isConverting}
                downloadDelayMs={mapping.downloadDelayMs}
                batchProgress={batchProgress}
              />

              <AssetQueueTable
                assets={assets}
                effectiveAssets={effectiveAssets}
                assetViewMode={assetViewMode}
                onChangeAssetViewMode={setAssetViewMode}
                duplicateMatchScope={duplicateMatchScope}
                onChangeDuplicateMatchScope={setDuplicateMatchScope}
                duplicateAnalysis={duplicateAnalysis}
                mapping={mapping}
                selectedIds={selectedIds}
                selectedFolder={selectedFolder}
                onClearFolderFilter={() => setSelectedFolder(null)}
                onToggleSelect={handleToggleSelect}
                onToggleSelectVisible={handleToggleSelectVisible}
                onClearSelection={handleClearSelection}
                isValidating={isValidating}
                isFetching={isFetching}
                isConverting={isConverting}
                isZipping={isZipping}
                zipProgress={zipProgress}
                hasTransformActive={
                  mapping.outputFormat !== "original" || mapping.resizeEnabled
                }
                supportsFolderSave={folderSaveSupported}
                onValidateImages={() => {
                  const pool =
                    selectedIds.size > 0
                      ? effectiveAssets.filter((a) => selectedIds.has(a.id))
                      : effectiveAssets;
                  const hasReady = pool.some((a) => a.status === "ready");
                  runBatchValidate(
                    hasReady ? ["ready"] : ["reachable", "broken"]
                  );
                }}
                onPauseValidation={handlePauseValidation}
                onRevalidateBroken={() => runBatchValidate(["broken"])}
                onStartFetch={() => runBatchFetch(["ready", "reachable"])}
                onPauseFetch={handlePauseFetch}
                onRetryFailed={() => runBatchFetch(["failed"])}
                onConvertSaved={runBatchConvert}
                onPauseConvert={handlePauseConvert}
                onBulkRename={handleBulkRename}
                onExportZip={handleExportZip}
                onSaveToFolder={handleSaveToFolder}
                onExportCsv={handleExportCsv}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

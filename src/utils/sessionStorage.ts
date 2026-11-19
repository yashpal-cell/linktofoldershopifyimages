import type {
  AssetStatus,
  AssetViewMode,
  DuplicateMatchScope,
  MappingConfig,
  PlannedAsset,
  WorkbookData,
} from "../types/asset.ts";

export const SESSION_STORAGE_KEY = "stylevault_autosave_v1";

export const DEFAULT_MAPPING_CONFIG: MappingConfig = {
  styleColumn: "",
  fileNameColumn: "",
  urlColumns: [],
  rootFolderName: "",
  splitMultiUrls: true,
  stripShopifyResizeParams: false,
  duplicatePolicy: "number",
  defaultFolderName: "Unsorted",
  concurrency: 5,
  downloadDelayMs: 0,
  outputFormat: "original",
  outputQuality: 90,
  resizeEnabled: false,
  targetWidth: null,
  targetHeight: null,
  resizeFit: "inside",
  backgroundColor: "#ffffff",
};

export type SerializableAsset = Omit<PlannedAsset, "blob" | "previewUrl">;

export interface SavedSessionPayload {
  version: 1;
  savedAt: number;
  workbook: WorkbookData | null;
  activeSheetIndex: number;
  mapping: MappingConfig;
  assets: SerializableAsset[];
  selectedFolder: string | null;
  selectedIds: string[];
  assetViewMode?: AssetViewMode;
  duplicateMatchScope?: DuplicateMatchScope;
}

export interface RestoredSession {
  savedAt: number;
  workbook: WorkbookData | null;
  activeSheetIndex: number;
  mapping: MappingConfig;
  assets: PlannedAsset[];
  selectedFolder: string | null;
  selectedIds: Set<string>;
  restoredFromSavedCount: number;
  assetViewMode: AssetViewMode;
  duplicateMatchScope: DuplicateMatchScope;
}

export type SaveSessionResult =
  | { ok: true; savedAt: number; trimmedInactiveSheets?: boolean }
  | { ok: false; reason: "empty" | "quota" | "unavailable" };

function stripRuntimeAssetFields(asset: PlannedAsset): SerializableAsset {
  const { blob: _blob, previewUrl: _previewUrl, ...serializable } = asset;
  return serializable;
}

function normalizeRestoredStatus(
  status: AssetStatus
): { status: AssetStatus; clearedSavedBlob: boolean } {
  if (status === "validating" || status === "fetching") {
    return { status: "ready", clearedSavedBlob: false };
  }
  if (status === "saved") {
    return { status: "reachable", clearedSavedBlob: true };
  }
  return { status, clearedSavedBlob: false };
}

function isQuotaError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      err.code === 22 ||
      err.code === 1014)
  );
}

export function saveSessionState(input: {
  workbook: WorkbookData | null;
  activeSheetIndex: number;
  mapping: MappingConfig;
  assets: PlannedAsset[];
  selectedFolder: string | null;
  selectedIds: Set<string>;
  assetViewMode?: AssetViewMode;
  duplicateMatchScope?: DuplicateMatchScope;
}): SaveSessionResult {
  if (typeof window === "undefined" || !window.localStorage) {
    return { ok: false, reason: "unavailable" };
  }

  if (!input.workbook && input.assets.length === 0) {
    try {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage access errors
    }
    return { ok: false, reason: "empty" };
  }

  const savedAt = Date.now();
  const serializableAssets = input.assets.map(stripRuntimeAssetFields);
  const payload: SavedSessionPayload = {
    version: 1,
    savedAt,
    workbook: input.workbook,
    activeSheetIndex: input.activeSheetIndex,
    mapping: input.mapping,
    assets: serializableAssets,
    selectedFolder: input.selectedFolder,
    selectedIds: Array.from(input.selectedIds),
    assetViewMode: input.assetViewMode ?? "all",
    duplicateMatchScope: input.duplicateMatchScope ?? "filename",
  };

  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
    return { ok: true, savedAt };
  } catch (err: unknown) {
    if (
      isQuotaError(err) &&
      input.workbook &&
      input.workbook.sheets.length > 1
    ) {
      // Fallback: persist only the active sheet if multi-sheet workbook exceeds quota
      const activeSheet =
        input.workbook.sheets[input.activeSheetIndex] ?? input.workbook.sheets[0];
      const trimmedPayload: SavedSessionPayload = {
        ...payload,
        workbook: {
          fileName: input.workbook.fileName,
          sheets: activeSheet ? [activeSheet] : [],
        },
        activeSheetIndex: 0,
      };
      try {
        window.localStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify(trimmedPayload)
        );
        return { ok: true, savedAt, trimmedInactiveSheets: true };
      } catch {
        return { ok: false, reason: "quota" };
      }
    }

    return {
      ok: false,
      reason: isQuotaError(err) ? "quota" : "unavailable",
    };
  }
}

export function loadSessionState(): RestoredSession | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<SavedSessionPayload>;
    if (!parsed || parsed.version !== 1) return null;

    const workbook =
      parsed.workbook &&
      typeof parsed.workbook.fileName === "string" &&
      Array.isArray(parsed.workbook.sheets) &&
      parsed.workbook.sheets.length > 0
        ? parsed.workbook
        : null;

    const rawAssets = Array.isArray(parsed.assets) ? parsed.assets : [];
    if (!workbook && rawAssets.length === 0) {
      return null;
    }

    const sheetCount = workbook?.sheets.length ?? 0;
    const rawSheetIndex =
      typeof parsed.activeSheetIndex === "number" ? parsed.activeSheetIndex : 0;
    const activeSheetIndex =
      sheetCount > 0
        ? Math.max(0, Math.min(rawSheetIndex, sheetCount - 1))
        : 0;

    const rawMapping = parsed.mapping;
    const validFormats = new Set([
      "original",
      "jpg",
      "png",
      "webp",
      "avif",
      "tiff",
      "gif",
    ]);
    const validFits = new Set(["inside", "contain", "cover", "fill"]);
    const mapping: MappingConfig = {
      ...DEFAULT_MAPPING_CONFIG,
      ...(rawMapping && typeof rawMapping === "object" ? rawMapping : {}),
      urlColumns: Array.isArray(rawMapping?.urlColumns)
        ? rawMapping.urlColumns.filter((c): c is string => typeof c === "string")
        : [],
      concurrency:
        typeof rawMapping?.concurrency === "number" &&
        Number.isFinite(rawMapping.concurrency)
          ? Math.max(1, Math.min(8, rawMapping.concurrency))
          : DEFAULT_MAPPING_CONFIG.concurrency,
      downloadDelayMs:
        typeof rawMapping?.downloadDelayMs === "number" &&
        Number.isFinite(rawMapping.downloadDelayMs)
          ? Math.max(0, Math.min(30000, rawMapping.downloadDelayMs))
          : DEFAULT_MAPPING_CONFIG.downloadDelayMs,
      outputFormat:
        typeof rawMapping?.outputFormat === "string" &&
        validFormats.has(rawMapping.outputFormat)
          ? rawMapping.outputFormat
          : DEFAULT_MAPPING_CONFIG.outputFormat,
      outputQuality:
        typeof rawMapping?.outputQuality === "number" &&
        Number.isFinite(rawMapping.outputQuality)
          ? Math.max(10, Math.min(100, Math.round(rawMapping.outputQuality)))
          : DEFAULT_MAPPING_CONFIG.outputQuality,
      resizeEnabled: Boolean(rawMapping?.resizeEnabled),
      targetWidth:
        typeof rawMapping?.targetWidth === "number" &&
        Number.isFinite(rawMapping.targetWidth) &&
        rawMapping.targetWidth > 0
          ? Math.max(1, Math.min(10000, Math.round(rawMapping.targetWidth)))
          : null,
      targetHeight:
        typeof rawMapping?.targetHeight === "number" &&
        Number.isFinite(rawMapping.targetHeight) &&
        rawMapping.targetHeight > 0
          ? Math.max(1, Math.min(10000, Math.round(rawMapping.targetHeight)))
          : null,
      resizeFit:
        typeof rawMapping?.resizeFit === "string" &&
        validFits.has(rawMapping.resizeFit)
          ? rawMapping.resizeFit
          : DEFAULT_MAPPING_CONFIG.resizeFit,
      backgroundColor:
        typeof rawMapping?.backgroundColor === "string" &&
        /^#[0-9a-f]{3,6}$/i.test(rawMapping.backgroundColor)
          ? rawMapping.backgroundColor
          : DEFAULT_MAPPING_CONFIG.backgroundColor,
    };

    let restoredFromSavedCount = 0;
    const assets: PlannedAsset[] = [];
    const validIds = new Set<string>();
    const validFolders = new Set<string>();

    for (const item of rawAssets) {
      if (
        !item ||
        typeof item.id !== "string" ||
        typeof item.sourceUrl !== "string" ||
        typeof item.targetPath !== "string"
      ) {
        continue;
      }

      const normalized = normalizeRestoredStatus(item.status);
      if (normalized.clearedSavedBlob) {
        restoredFromSavedCount++;
      }

      assets.push({
        ...item,
        status: normalized.status,
        needsTransform: normalized.clearedSavedBlob ? false : item.needsTransform,
      });
      validIds.add(item.id);
      if (item.styleFolder) {
        validFolders.add(item.styleFolder);
      }
    }

    const selectedIds = new Set<string>();
    if (Array.isArray(parsed.selectedIds)) {
      for (const id of parsed.selectedIds) {
        if (typeof id === "string" && validIds.has(id)) {
          selectedIds.add(id);
        }
      }
    }

    const selectedFolder =
      typeof parsed.selectedFolder === "string" &&
      validFolders.has(parsed.selectedFolder)
        ? parsed.selectedFolder
        : null;

    const assetViewMode: AssetViewMode =
      parsed.assetViewMode === "unique" ? "unique" : "all";
    const duplicateMatchScope: DuplicateMatchScope =
      parsed.duplicateMatchScope === "folder" ? "folder" : "filename";

    return {
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
      workbook,
      activeSheetIndex,
      mapping,
      assets,
      selectedFolder,
      selectedIds,
      restoredFromSavedCount,
      assetViewMode,
      duplicateMatchScope,
    };
  } catch {
    return null;
  }
}

export function clearSessionState(): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage access errors
  }
}

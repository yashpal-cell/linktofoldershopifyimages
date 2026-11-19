import type {
  DuplicateMatchScope,
  FolderNode,
  MappingConfig,
  OutputImageFormat,
  PlannedAsset,
  SheetData,
} from "../types/asset.ts";

export function formatToExtension(format: OutputImageFormat): string | null {
  if (!format || format === "original") return null;
  return `.${format}`;
}

const KNOWN_IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
  ".svg",
  ".bmp",
  ".tiff",
  ".tif",
  ".ico",
]);

export function sanitizeSegment(input: string, fallback = "untitled"): string {
  const cleaned = input
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "");

  return cleaned || fallback;
}

export function extractUrlsFromCell(
  cellValue: string,
  splitMultiUrls: boolean
): string[] {
  const trimmed = cellValue.trim();
  if (!trimmed) return [];

  if (!splitMultiUrls) {
    return /^https?:\/\//i.test(trimmed) ? [trimmed] : [];
  }

  // Split by newlines, pipes, semicolons, or commas followed by http(s)://
  const parts = trimmed
    .split(/[\r\n;|]+|(?:\s*,\s*(?=https?:\/\/))/i)
    .map((part) => part.trim())
    .filter((part) => /^https?:\/\//i.test(part));

  return parts;
}

export function extractExtensionFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const match = parsed.pathname
      .toLowerCase()
      .match(/\.(jpg|jpeg|png|webp|gif|avif|svg|bmp|tiff?|ico)$/);
    if (!match) return ".jpg";
    return match[0] === ".jpeg" ? ".jpg" : match[0];
  } catch {
    return ".jpg";
  }
}

export function extractFileNameFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] || "image";
    const decoded = decodeURIComponent(last);
    return decoded.replace(/\.[a-z0-9]{2,5}$/i, "") || "image";
  } catch {
    return "image";
  }
}

export function splitNameAndExtension(rawName: string): {
  baseName: string;
  explicitExt: string | null;
} {
  const trimmed = rawName.trim();
  const match = trimmed.match(/(\.[a-z0-9]{2,5})$/i);
  if (match && KNOWN_IMAGE_EXTENSIONS.has(match[1].toLowerCase())) {
    const ext = match[1].toLowerCase() === ".jpeg" ? ".jpg" : match[1].toLowerCase();
    const base = trimmed.slice(0, trimmed.length - match[1].length).trim();
    return {
      baseName: sanitizeSegment(base, "image"),
      explicitExt: ext,
    };
  }
  return {
    baseName: sanitizeSegment(trimmed, "image"),
    explicitExt: null,
  };
}

export function buildPlannedAssets(
  sheet: SheetData,
  config: MappingConfig
): PlannedAsset[] {
  const assets: PlannedAsset[] = [];
  const usedPaths = new Map<string, number>();

  const rootPrefix = config.rootFolderName.trim()
    ? sanitizeSegment(config.rootFolderName.trim(), "")
    : "";

  sheet.rows.forEach((row, idx) => {
    const rowNumber = idx + 2; // 1-indexed spreadsheet row assuming header on row 1
    const rawStyle = config.styleColumn ? (row[config.styleColumn] ?? "") : "";
    const styleFolder = config.styleColumn
      ? sanitizeSegment(rawStyle, config.defaultFolderName || "Unsorted")
      : sanitizeSegment(config.defaultFolderName || "All_Images", "All_Images");

    const rawFileCell = config.fileNameColumn
      ? (row[config.fileNameColumn] ?? "").trim()
      : "";

    // Gather all URLs across mapped URL columns for this row
    const rowUrls: { url: string; column: string }[] = [];
    for (const col of config.urlColumns) {
      const cell = row[col] ?? "";
      const extracted = extractUrlsFromCell(cell, config.splitMultiUrls);
      for (const url of extracted) {
        rowUrls.push({ url, column: col });
      }
    }

    if (rowUrls.length === 0) return;

    rowUrls.forEach((entry, urlIdx) => {
      const urlExt = extractExtensionFromUrl(entry.url);
      let baseInput = rawFileCell;

      if (!baseInput) {
        baseInput = extractFileNameFromUrl(entry.url);
      } else if (rowUrls.length > 1) {
        // Multiple images on the same Excel row share one File Name cell
        const { baseName, explicitExt } = splitNameAndExtension(baseInput);
        const colSuffix =
          config.urlColumns.length > 1
            ? `_${sanitizeSegment(entry.column, String(urlIdx + 1))}`
            : `_${urlIdx + 1}`;
        baseInput = `${baseName}${colSuffix}${explicitExt ?? ""}`;
      }

      const { baseName, explicitExt } = splitNameAndExtension(baseInput);
      const forcedExt = formatToExtension(config.outputFormat);
      const plannedExt = forcedExt ?? explicitExt ?? urlExt;
      const folderKey = styleFolder.toLowerCase();

      let finalBaseName = baseName;
      let duplicateOriginStem: string | undefined;
      let status: PlannedAsset["status"] = "ready";
      const candidateKey = `${folderKey}/${finalBaseName.toLowerCase()}${plannedExt}`;
      const existingCount = usedPaths.get(candidateKey) ?? 0;

      if (existingCount > 0) {
        duplicateOriginStem = baseName.toLowerCase();
        if (config.duplicatePolicy === "skip") {
          status = "skipped";
        } else if (config.duplicatePolicy === "number") {
          let counter = existingCount + 1;
          while (
            usedPaths.has(
              `${folderKey}/${baseName.toLowerCase()}_${counter}${plannedExt}`
            )
          ) {
            counter++;
          }
          finalBaseName = `${baseName}_${counter}`;
          usedPaths.set(
            `${folderKey}/${finalBaseName.toLowerCase()}${plannedExt}`,
            1
          );
        }
      }

      usedPaths.set(candidateKey, existingCount + 1);

      const targetFileName = `${finalBaseName}${plannedExt}`;
      const targetPath = rootPrefix
        ? `${rootPrefix}/${styleFolder}/${targetFileName}`
        : `${styleFolder}/${targetFileName}`;

      assets.push({
        id: `${rowNumber}-${urlIdx}-${entry.column}`,
        rowIndex: rowNumber,
        styleFolder,
        rawFileName: rawFileCell || extractFileNameFromUrl(entry.url),
        sanitizedBaseName: finalBaseName,
        ...(duplicateOriginStem ? { duplicateOriginStem } : {}),
        plannedExtension: plannedExt,
        targetFileName,
        targetPath,
        sourceUrl: entry.url,
        sourceColumn: entry.column,
        status,
      });
    });
  });

  return assets;
}

export function groupAssetsByFolder(assets: PlannedAsset[]): FolderNode[] {
  const map = new Map<string, PlannedAsset[]>();
  for (const asset of assets) {
    const existing = map.get(asset.styleFolder);
    if (existing) {
      existing.push(asset);
    } else {
      map.set(asset.styleFolder, [asset]);
    }
  }

  return Array.from(map.entries()).map(([name, files]) => ({
    name,
    files,
  }));
}

export function buildTargetPath(
  rootFolderName: string,
  styleFolder: string,
  targetFileName: string
): string {
  const rootPrefix = rootFolderName.trim()
    ? sanitizeSegment(rootFolderName.trim(), "")
    : "";
  return rootPrefix
    ? `${rootPrefix}/${styleFolder}/${targetFileName}`
    : `${styleFolder}/${targetFileName}`;
}

export function resolveUniqueFileStem(
  existingAssets: PlannedAsset[],
  targetFolder: string,
  desiredBaseName: string,
  extension: string,
  excludeAssetIds?: Set<string>
): string {
  const folderLower = targetFolder.toLowerCase();
  const extLower = extension.toLowerCase();
  const occupied = new Set<string>();

  for (const item of existingAssets) {
    if (excludeAssetIds?.has(item.id)) continue;
    if (item.styleFolder.toLowerCase() === folderLower) {
      occupied.add(item.targetFileName.toLowerCase());
    }
  }

  const candidate = `${desiredBaseName}${extension}`;
  if (!occupied.has(candidate.toLowerCase())) {
    return desiredBaseName;
  }

  let counter = 2;
  while (
    occupied.has(`${desiredBaseName.toLowerCase()}_${counter}${extLower}`)
  ) {
    counter++;
  }
  return `${desiredBaseName}_${counter}`;
}

export function retargetQueueExtension(
  assets: PlannedAsset[],
  config: MappingConfig
): PlannedAsset[] {
  const forcedExt = formatToExtension(config.outputFormat);

  return assets.map((item) => {
    // Keep already-saved blobs on their actual downloaded filename until explicitly converted
    if (item.status === "saved" && item.blob) {
      return item;
    }

    const { explicitExt } = splitNameAndExtension(item.rawFileName);
    const nextExt =
      forcedExt ??
      item.detectedExtension ??
      explicitExt ??
      extractExtensionFromUrl(item.sourceUrl);

    if (nextExt === item.plannedExtension) {
      return item;
    }

    const targetFileName = `${item.sanitizedBaseName}${nextExt}`;
    return {
      ...item,
      plannedExtension: nextExt,
      targetFileName,
      targetPath: buildTargetPath(
        config.rootFolderName,
        item.styleFolder,
        targetFileName
      ),
    };
  });
}

export interface DuplicateOccurrenceInfo {
  index: number;
  total: number;
  primaryId: string;
  primaryRowIndex: number;
  primaryFileName: string;
  isDuplicateOccurrence: boolean;
}

export interface DuplicateAnalysis {
  primaryIds: Set<string>;
  duplicateIds: Set<string>;
  allInvolvedIds: Set<string>;
  occurrenceById: Map<string, DuplicateOccurrenceInfo>;
}

export function analyzeDuplicateFilenames(
  assets: PlannedAsset[],
  scope: DuplicateMatchScope = "filename"
): DuplicateAnalysis {
  const groups = new Map<string, PlannedAsset[]>();

  for (const asset of assets) {
    const effectiveStem = (
      asset.duplicateOriginStem || asset.sanitizedBaseName
    )
      .trim()
      .toLowerCase();
    const ext = asset.plannedExtension.trim().toLowerCase();
    const canonicalFile = `${effectiveStem}${ext}`;
    const key =
      scope === "folder"
        ? `${asset.styleFolder.trim().toLowerCase()}/${canonicalFile}`
        : canonicalFile;

    const existing = groups.get(key);
    if (existing) {
      existing.push(asset);
    } else {
      groups.set(key, [asset]);
    }
  }

  const primaryIds = new Set<string>();
  const duplicateIds = new Set<string>();
  const allInvolvedIds = new Set<string>();
  const occurrenceById = new Map<string, DuplicateOccurrenceInfo>();

  for (const group of groups.values()) {
    if (group.length <= 1) continue;

    // Prefer the first non-skipped asset as the primary unique asset
    const primaryAsset =
      group.find((item) => item.status !== "skipped") ?? group[0];
    primaryIds.add(primaryAsset.id);

    const ordered = [
      primaryAsset,
      ...group.filter((item) => item.id !== primaryAsset.id),
    ];

    ordered.forEach((item, idx) => {
      allInvolvedIds.add(item.id);
      const isDup = idx > 0;
      if (isDup) {
        duplicateIds.add(item.id);
      }
      occurrenceById.set(item.id, {
        index: idx + 1,
        total: ordered.length,
        primaryId: primaryAsset.id,
        primaryRowIndex: primaryAsset.rowIndex,
        primaryFileName: primaryAsset.targetFileName,
        isDuplicateOccurrence: isDup,
      });
    });
  }

  return {
    primaryIds,
    duplicateIds,
    allInvolvedIds,
    occurrenceById,
  };
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

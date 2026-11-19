import JSZip from "jszip";
import type { MappingConfig, PlannedAsset } from "../types/asset.ts";
import {
  formatToExtension,
  sanitizeSegment,
  splitNameAndExtension,
} from "./fileNaming.ts";

export interface FetchAssetResult {
  id: string;
  ok: boolean;
  blob?: Blob;
  previewUrl?: string;
  byteSize?: number;
  contentType?: string;
  detectedExtension?: string;
  imageWidth?: number;
  imageHeight?: number;
  errorMessage?: string;
}

export interface ValidateAssetResult {
  id: string;
  valid: boolean;
  status?: number;
  contentType?: string;
  contentLength?: number;
  detectedExtension?: string;
  errorMessage?: string;
}

export async function validateSingleAsset(
  asset: PlannedAsset,
  stripResizeParams: boolean,
  signal?: AbortSignal
): Promise<ValidateAssetResult> {
  try {
    const response = await fetch("/api/validate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: asset.sourceUrl,
        stripResizeParams,
      }),
      signal,
    });

    const data = (await response.json()) as {
      valid?: boolean;
      status?: number;
      contentType?: string;
      contentLength?: number;
      detectedExtension?: string;
      error?: string;
    };

    if (!response.ok || !data.valid) {
      return {
        id: asset.id,
        valid: false,
        status: data.status,
        contentType: data.contentType,
        errorMessage: data.error || `HTTP ${response.status}`,
      };
    }

    return {
      id: asset.id,
      valid: true,
      status: data.status,
      contentType: data.contentType,
      contentLength: data.contentLength,
      detectedExtension: data.detectedExtension,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        id: asset.id,
        valid: false,
        errorMessage: "Cancelled",
      };
    }
    return {
      id: asset.id,
      valid: false,
      errorMessage:
        err instanceof Error ? err.message : "Network error while checking URL",
    };
  }
}

function buildTransformPayload(config: MappingConfig) {
  return {
    outputFormat: config.outputFormat,
    quality: config.outputQuality,
    resizeEnabled: config.resizeEnabled,
    width: config.targetWidth,
    height: config.targetHeight,
    fit: config.resizeFit,
    background: config.backgroundColor,
  };
}

function parseOptionalDimensionHeader(raw: string | null): number | undefined {
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const val = Number(raw);
  return val > 0 ? val : undefined;
}

export async function fetchSingleAsset(
  asset: PlannedAsset,
  config: MappingConfig,
  signal?: AbortSignal
): Promise<FetchAssetResult> {
  try {
    const response = await fetch("/api/fetch-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: asset.sourceUrl,
        stripResizeParams: config.stripShopifyResizeParams,
        transform: buildTransformPayload(config),
      }),
      signal,
    });

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      try {
        const errJson = (await response.json()) as { error?: string };
        if (errJson?.error) errMsg = errJson.error;
      } catch {
        // Ignore JSON parse fallback
      }
      return {
        id: asset.id,
        ok: false,
        errorMessage: errMsg,
      };
    }

    const blob = await response.blob();
    const detectedExtension =
      response.headers.get("X-Detected-Extension") || asset.plannedExtension;
    const contentType =
      response.headers.get("X-Content-Type") || blob.type || "image/jpeg";
    const imageWidth = parseOptionalDimensionHeader(
      response.headers.get("X-Image-Width")
    );
    const imageHeight = parseOptionalDimensionHeader(
      response.headers.get("X-Image-Height")
    );
    const previewUrl = URL.createObjectURL(blob);

    return {
      id: asset.id,
      ok: true,
      blob,
      previewUrl,
      byteSize: blob.size,
      contentType,
      detectedExtension,
      imageWidth,
      imageHeight,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        id: asset.id,
        ok: false,
        errorMessage: "Cancelled",
      };
    }
    return {
      id: asset.id,
      ok: false,
      errorMessage:
        err instanceof Error ? err.message : "Network error while fetching image",
    };
  }
}

export async function convertSavedAsset(
  asset: PlannedAsset,
  config: MappingConfig,
  signal?: AbortSignal
): Promise<FetchAssetResult> {
  if (!asset.blob) {
    return {
      id: asset.id,
      ok: false,
      errorMessage: "No downloaded image bytes in memory.",
    };
  }

  try {
    const params = new URLSearchParams({
      format: config.outputFormat,
      quality: String(config.outputQuality),
      resizeEnabled: String(config.resizeEnabled),
      fit: config.resizeFit,
      background: config.backgroundColor,
    });
    if (config.targetWidth && config.targetWidth > 0) {
      params.set("width", String(config.targetWidth));
    }
    if (config.targetHeight && config.targetHeight > 0) {
      params.set("height", String(config.targetHeight));
    }

    const response = await fetch(`/api/convert-image?${params.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": asset.contentType || asset.blob.type || "application/octet-stream",
      },
      body: asset.blob,
      signal,
    });

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      try {
        const errJson = (await response.json()) as { error?: string };
        if (errJson?.error) errMsg = errJson.error;
      } catch {
        // Ignore JSON parse fallback
      }
      return {
        id: asset.id,
        ok: false,
        errorMessage: errMsg,
      };
    }

    const convertedBlob = await response.blob();
    const detectedExtension =
      response.headers.get("X-Detected-Extension") || asset.plannedExtension;
    const contentType =
      response.headers.get("X-Content-Type") || convertedBlob.type || "image/jpeg";
    const imageWidth = parseOptionalDimensionHeader(
      response.headers.get("X-Image-Width")
    );
    const imageHeight = parseOptionalDimensionHeader(
      response.headers.get("X-Image-Height")
    );
    const previewUrl = URL.createObjectURL(convertedBlob);

    return {
      id: asset.id,
      ok: true,
      blob: convertedBlob,
      previewUrl,
      byteSize: convertedBlob.size,
      contentType,
      detectedExtension,
      imageWidth,
      imageHeight,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        id: asset.id,
        ok: false,
        errorMessage: "Cancelled",
      };
    }
    return {
      id: asset.id,
      ok: false,
      errorMessage:
        err instanceof Error ? err.message : "Failed to convert image.",
    };
  }
}

export function applyDetectedExtensionToPath(
  asset: PlannedAsset,
  detectedExt: string,
  config: MappingConfig
): { targetFileName: string; targetPath: string; plannedExtension: string } {
  const { explicitExt } = splitNameAndExtension(asset.rawFileName);
  const forcedExt = formatToExtension(config.outputFormat);
  // If an explicit output conversion format is active, always enforce its extension;
  // otherwise keep explicit Excel extension or adopt server-detected extension.
  const finalExt = forcedExt ?? explicitExt ?? detectedExt ?? asset.plannedExtension;
  const targetFileName = `${asset.sanitizedBaseName}${finalExt}`;
  const rootPrefix = config.rootFolderName.trim()
    ? sanitizeSegment(config.rootFolderName.trim(), "")
    : "";
  const targetPath = rootPrefix
    ? `${rootPrefix}/${asset.styleFolder}/${targetFileName}`
    : `${asset.styleFolder}/${targetFileName}`;

  return { targetFileName, targetPath, plannedExtension: finalExt };
}

export async function exportAssetsAsZip(
  assets: PlannedAsset[],
  zipBaseName: string,
  onProgress?: (percent: number) => void
): Promise<number> {
  const savedAssets = assets.filter((a) => a.status === "saved" && a.blob);
  if (savedAssets.length === 0) {
    throw new Error("No downloaded images available to package.");
  }

  const zip = new JSZip();
  const usedZipPaths = new Set<string>();

  for (const asset of savedAssets) {
    if (!asset.blob) continue;

    let pathInZip = asset.targetPath;
    if (usedZipPaths.has(pathInZip.toLowerCase())) {
      const dotIdx = pathInZip.lastIndexOf(".");
      const stem = dotIdx !== -1 ? pathInZip.slice(0, dotIdx) : pathInZip;
      const ext = dotIdx !== -1 ? pathInZip.slice(dotIdx) : "";
      let counter = 2;
      while (usedZipPaths.has(`${stem}_${counter}${ext}`.toLowerCase())) {
        counter++;
      }
      pathInZip = `${stem}_${counter}${ext}`;
    }

    usedZipPaths.add(pathInZip.toLowerCase());
    zip.file(pathInZip, asset.blob);
  }

  const zipBlob = await zip.generateAsync(
    { type: "blob", compression: "STORE" },
    (meta) => {
      if (onProgress) onProgress(Math.round(meta.percent));
    }
  );

  const safeZipName = sanitizeSegment(zipBaseName, "shopify_style_images");
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeZipName}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  return savedAssets.length;
}

export function supportsLocalDirectoryPicker(): boolean {
  if (typeof window === "undefined") return false;
  return "showDirectoryPicker" in window;
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: {
    mode?: "read" | "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
}

export async function saveAssetsToLocalFolder(
  assets: PlannedAsset[]
): Promise<number> {
  const savedAssets = assets.filter((a) => a.status === "saved" && a.blob);
  if (savedAssets.length === 0) {
    throw new Error("No downloaded images available to save.");
  }

  const pickerWindow = window as DirectoryPickerWindow;
  if (!pickerWindow.showDirectoryPicker) {
    throw new Error(
      "Direct folder saving is not supported in this browser. Use Download ZIP instead."
    );
  }

  const rootHandle = await pickerWindow.showDirectoryPicker({ mode: "readwrite" });
  const dirCache = new Map<string, FileSystemDirectoryHandle>();
  dirCache.set("", rootHandle);

  async function ensureDirectory(segments: string[]): Promise<FileSystemDirectoryHandle> {
    let current = rootHandle;
    let currentPath = "";
    for (const seg of segments) {
      currentPath = currentPath ? `${currentPath}/${seg}` : seg;
      const cached = dirCache.get(currentPath);
      if (cached) {
        current = cached;
      } else {
        current = await current.getDirectoryHandle(seg, { create: true });
        dirCache.set(currentPath, current);
      }
    }
    return current;
  }

  let written = 0;
  for (const asset of savedAssets) {
    if (!asset.blob) continue;
    const parts = asset.targetPath.split("/").filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) continue;

    const targetDir = await ensureDirectory(parts);
    const fileHandle = await targetDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(asset.blob);
    await writable.close();
    written++;
  }

  return written;
}

export function exportManifestCsv(assets: PlannedAsset[], baseName: string): void {
  const headers = [
    "Excel Row",
    "Style Folder",
    "Target File Name",
    "Target Path",
    "Status",
    "Dimensions",
    "File Size (Bytes)",
    "Source Column",
    "Shopify CDN URL",
    "Error",
  ];

  const escapeCsv = (val: string | number | undefined): string => {
    const str = String(val ?? "");
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.join(","),
    ...assets.map((a) =>
      [
        a.rowIndex,
        a.styleFolder,
        a.targetFileName,
        a.targetPath,
        a.status,
        a.imageWidth && a.imageHeight ? `${a.imageWidth}x${a.imageHeight}` : "",
        a.byteSize ?? "",
        a.sourceColumn,
        a.sourceUrl,
        a.errorMessage ?? "",
      ]
        .map(escapeCsv)
        .join(",")
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sanitizeSegment(baseName, "manifest")}_report.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

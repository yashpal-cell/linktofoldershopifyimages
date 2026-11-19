export type AssetStatus =
  | "ready"
  | "validating"
  | "reachable"
  | "broken"
  | "fetching"
  | "saved"
  | "failed"
  | "skipped";

export type DuplicatePolicy = "number" | "skip" | "overwrite";

export type OutputImageFormat =
  | "original"
  | "jpg"
  | "png"
  | "webp"
  | "avif"
  | "tiff"
  | "gif";

export type ResizeFitMode = "inside" | "contain" | "cover" | "fill";

export interface SheetData {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
}

export interface WorkbookData {
  fileName: string;
  sheets: SheetData[];
}

export interface MappingConfig {
  styleColumn: string;
  fileNameColumn: string;
  urlColumns: string[];
  rootFolderName: string;
  splitMultiUrls: boolean;
  stripShopifyResizeParams: boolean;
  duplicatePolicy: DuplicatePolicy;
  defaultFolderName: string;
  concurrency: number;
  downloadDelayMs: number;
  outputFormat: OutputImageFormat;
  outputQuality: number;
  resizeEnabled: boolean;
  targetWidth: number | null;
  targetHeight: number | null;
  resizeFit: ResizeFitMode;
  backgroundColor: string;
}

export interface PlannedAsset {
  id: string;
  rowIndex: number;
  styleFolder: string;
  rawFileName: string;
  sanitizedBaseName: string;
  plannedExtension: string;
  targetFileName: string;
  targetPath: string;
  sourceUrl: string;
  sourceColumn: string;
  status: AssetStatus;
  httpStatus?: number;
  errorMessage?: string;
  byteSize?: number;
  contentType?: string;
  detectedExtension?: string;
  imageWidth?: number;
  imageHeight?: number;
  needsTransform?: boolean;
  blob?: Blob;
  previewUrl?: string;
}

export interface FolderNode {
  name: string;
  files: PlannedAsset[];
}

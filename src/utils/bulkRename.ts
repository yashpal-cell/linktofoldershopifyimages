import type { PlannedAsset } from "../types/asset.ts";
import {
  buildTargetPath,
  sanitizeSegment,
  splitNameAndExtension,
} from "./fileNaming.ts";

export type BulkRenameMode = "sequence" | "regex";

export interface BulkRenameRule {
  mode: BulkRenameMode;
  // Sequence mode
  template: string;
  startAt: number;
  step: number;
  padDigits: number;
  perFolder: boolean;
  extensionBehavior: "auto" | "keep";
  // Regex mode
  pattern: string;
  replacement: string;
  flagCaseInsensitive: boolean;
  flagGlobal: boolean;
  matchTarget: "stem" | "full";
}

export interface BulkRenamePreviewItem {
  assetId: string;
  rowIndex: number;
  styleFolder: string;
  oldFileName: string;
  newFileName: string;
  newBaseName: string;
  newExtension: string;
  newTargetPath: string;
  changed: boolean;
  deduped: boolean;
}

export interface BulkRenamePlanResult {
  items: BulkRenamePreviewItem[];
  error: string | null;
  changedCount: number;
}

export const DEFAULT_BULK_RENAME_RULE: BulkRenameRule = {
  mode: "sequence",
  template: "{style}_{seq:3}",
  startAt: 1,
  step: 1,
  padDigits: 3,
  perFolder: false,
  extensionBehavior: "auto",
  pattern: "",
  replacement: "",
  flagCaseInsensitive: true,
  flagGlobal: true,
  matchTarget: "stem",
};

function formatSequenceNumber(num: number, width: number): string {
  const safeNum = Math.max(0, Math.round(num));
  const safeWidth = Math.max(1, Math.min(8, Math.round(width)));
  return String(safeNum).padStart(safeWidth, "0");
}

const TEMPLATE_TRAILING_EXT_RE =
  /\.(jpg|jpeg|png|webp|gif|avif|svg|bmp|tiff?|ico)$/i;

function applySequenceTemplate(
  rawTemplate: string,
  asset: PlannedAsset,
  seqIndex: number,
  rule: BulkRenameRule
): { rawBaseName: string; explicitExt: string | null } {
  const trimmed = rawTemplate.trim();
  const extMatch = trimmed.match(TEMPLATE_TRAILING_EXT_RE);
  const rawExplicitExt = extMatch
    ? extMatch[0].toLowerCase() === ".jpeg"
      ? ".jpg"
      : extMatch[0].toLowerCase()
    : null;
  const templateBody = extMatch
    ? trimmed.slice(0, trimmed.length - extMatch[0].length)
    : trimmed;

  const hasExplicitSeqToken = /\{(seq|n)(?::(\d+))?\}/i.test(templateBody);
  const effectiveExt =
    rule.extensionBehavior === "auto" ? rawExplicitExt : null;

  const seqNumber = rule.startAt + seqIndex * Math.max(1, rule.step);

  // Replace known tokens first
  let resolved = templateBody
    .replace(/\{style\}/gi, asset.styleFolder)
    .replace(/\{name\}/gi, asset.sanitizedBaseName)
    .replace(/\{row\}/gi, String(asset.rowIndex))
    .replace(/\{(seq|n)(?::(\d+))?\}/gi, (_match, _token, widthStr) => {
      const width = widthStr ? Number(widthStr) : rule.padDigits;
      return formatSequenceNumber(seqNumber, width);
    });

  if (!hasExplicitSeqToken) {
    // Support literal examples like "prefix_001.jpg" or "prefix_01"
    const trailingDigitsMatch = resolved.match(/^(.*?)(\d+)$/);
    if (trailingDigitsMatch) {
      const prefix = trailingDigitsMatch[1];
      const digits = trailingDigitsMatch[2];
      const customStart = Number(digits);
      const width = digits.length;
      const offsetNumber = customStart + seqIndex * Math.max(1, rule.step);
      resolved = `${prefix}${formatSequenceNumber(offsetNumber, width)}`;
    } else if (resolved.trim()) {
      // Plain prefix without number/token -> append _001, _002, ...
      resolved = `${resolved.trim()}_${formatSequenceNumber(seqNumber, rule.padDigits)}`;
    } else {
      resolved = `image_${formatSequenceNumber(seqNumber, rule.padDigits)}`;
    }
  }

  return {
    rawBaseName: resolved,
    explicitExt: effectiveExt,
  };
}

export function computeBulkRenamePlan(
  allAssets: PlannedAsset[],
  selectedAssetsInOrder: PlannedAsset[],
  rule: BulkRenameRule,
  rootFolderName: string
): BulkRenamePlanResult {
  if (selectedAssetsInOrder.length === 0) {
    return { items: [], error: null, changedCount: 0 };
  }

  let compiledRegex: RegExp | null = null;
  if (rule.mode === "regex" && rule.pattern.length > 0) {
    try {
      const flags = `${rule.flagGlobal ? "g" : ""}${rule.flagCaseInsensitive ? "i" : ""}`;
      compiledRegex = new RegExp(rule.pattern, flags);
    } catch (err: unknown) {
      return {
        items: [],
        error:
          err instanceof Error ? err.message : "Invalid regular expression.",
        changedCount: 0,
      };
    }
  }

  const selectedIdSet = new Set(selectedAssetsInOrder.map((a) => a.id));

  // Track occupied filenames per folder from unselected assets first so selected items can swap/re-sequence cleanly
  const occupiedByFolder = new Map<string, Set<string>>();
  const getOccupiedSet = (folder: string): Set<string> => {
    const key = folder.toLowerCase();
    let set = occupiedByFolder.get(key);
    if (!set) {
      set = new Set<string>();
      occupiedByFolder.set(key, set);
    }
    return set;
  };

  for (const item of allAssets) {
    if (selectedIdSet.has(item.id)) continue;
    getOccupiedSet(item.styleFolder).add(item.targetFileName.toLowerCase());
  }

  const folderSequenceCounters = new Map<string, number>();
  const items: BulkRenamePreviewItem[] = [];
  let changedCount = 0;

  selectedAssetsInOrder.forEach((asset, globalIdx) => {
    const folderKey = asset.styleFolder.toLowerCase();
    const folderIdx = folderSequenceCounters.get(folderKey) ?? 0;
    folderSequenceCounters.set(folderKey, folderIdx + 1);
    const seqIdx = rule.perFolder ? folderIdx : globalIdx;

    let desiredBase = asset.sanitizedBaseName;
    let nextExt = asset.plannedExtension;

    if (rule.mode === "sequence") {
      const seqResult = applySequenceTemplate(
        rule.template,
        asset,
        seqIdx,
        rule
      );
      desiredBase = seqResult.rawBaseName;
      if (seqResult.explicitExt) {
        nextExt = seqResult.explicitExt;
      }
    } else if (rule.mode === "regex" && compiledRegex) {
      // Reset lastIndex before each test/replace when global flag is enabled
      compiledRegex.lastIndex = 0;
      const sourceText =
        rule.matchTarget === "full"
          ? asset.targetFileName
          : asset.sanitizedBaseName;

      const resolvedReplacement = rule.replacement
        .replace(/\{style\}/gi, asset.styleFolder)
        .replace(/\{row\}/gi, String(asset.rowIndex))
        .replace(/\{(seq|n)(?::(\d+))?\}/gi, (_m, _t, widthStr) => {
          const width = widthStr ? Number(widthStr) : rule.padDigits;
          const seqNumber = rule.startAt + seqIdx * Math.max(1, rule.step);
          return formatSequenceNumber(seqNumber, width);
        });

      const replaced = sourceText.replace(compiledRegex, resolvedReplacement);
      if (rule.matchTarget === "full") {
        const parsed = splitNameAndExtension(replaced);
        desiredBase = parsed.baseName;
        nextExt = parsed.explicitExt ?? asset.plannedExtension;
      } else {
        desiredBase = replaced;
      }
    }

    const sanitizedBase = sanitizeSegment(desiredBase, asset.sanitizedBaseName);
    const occupied = getOccupiedSet(asset.styleFolder);

    let finalStem = sanitizedBase;
    let deduped = false;
    if (occupied.has(`${finalStem}${nextExt}`.toLowerCase())) {
      deduped = true;
      let counter = 2;
      while (
        occupied.has(`${sanitizedBase}_${counter}${nextExt}`.toLowerCase())
      ) {
        counter++;
      }
      finalStem = `${sanitizedBase}_${counter}`;
    }

    const newFileName = `${finalStem}${nextExt}`;
    occupied.add(newFileName.toLowerCase());

    const newTargetPath = buildTargetPath(
      rootFolderName,
      asset.styleFolder,
      newFileName
    );
    const changed =
      newFileName !== asset.targetFileName ||
      newTargetPath !== asset.targetPath;

    if (changed) {
      changedCount++;
    }

    items.push({
      assetId: asset.id,
      rowIndex: asset.rowIndex,
      styleFolder: asset.styleFolder,
      oldFileName: asset.targetFileName,
      newFileName,
      newBaseName: finalStem,
      newExtension: nextExt,
      newTargetPath,
      changed,
      deduped,
    });
  });

  return {
    items,
    error: null,
    changedCount,
  };
}

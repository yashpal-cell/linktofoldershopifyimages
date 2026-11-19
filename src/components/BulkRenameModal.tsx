import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FileEdit, RotateCcw, X } from "lucide-react";
import type { PlannedAsset } from "../types/asset.ts";
import {
  computeBulkRenamePlan,
  DEFAULT_BULK_RENAME_RULE,
  type BulkRenamePreviewItem,
  type BulkRenameRule,
} from "../utils/bulkRename.ts";

interface BulkRenameModalProps {
  isOpen: boolean;
  allAssets: PlannedAsset[];
  selectedAssets: PlannedAsset[];
  rootFolderName: string;
  onClose: () => void;
  onApply: (items: BulkRenamePreviewItem[]) => void;
}

const SEQUENCE_TOKENS = [
  { label: "{style}", title: "Insert style folder name" },
  { label: "{name}", title: "Insert current file name stem" },
  { label: "{seq:3}", title: "Insert zero-padded sequence number (001, 002...)" },
  { label: "{row}", title: "Insert Excel row number" },
];

export function BulkRenameModal({
  isOpen,
  allAssets,
  selectedAssets,
  rootFolderName,
  onClose,
  onApply,
}: BulkRenameModalProps) {
  const [rule, setRule] = useState<BulkRenameRule>(DEFAULT_BULK_RENAME_RULE);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const plan = useMemo(
    () =>
      computeBulkRenamePlan(
        allAssets,
        selectedAssets,
        rule,
        rootFolderName
      ),
    [allAssets, selectedAssets, rule, rootFolderName]
  );

  const dedupedCount = useMemo(
    () => plan.items.filter((i) => i.deduped).length,
    [plan.items]
  );

  if (!isOpen) return null;

  const insertToken = (token: string) => {
    if (rule.mode === "sequence") {
      setRule((prev) => ({
        ...prev,
        template: prev.template ? `${prev.template}${token}` : token,
      }));
    } else {
      setRule((prev) => ({
        ...prev,
        replacement: `${prev.replacement}${token}`,
      }));
    }
  };

  const handleSubmit = () => {
    if (plan.error || plan.changedCount === 0) return;
    onApply(plan.items);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-rename-title"
    >
      <div
        className="bg-white border border-slate-200 rounded-lg w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileEdit className="w-4 h-4 text-teal-700 shrink-0" />
            <div className="min-w-0">
              <h3
                id="bulk-rename-title"
                className="text-sm font-semibold text-slate-900"
              >
                Bulk Rename Selected Assets
              </h3>
              <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                {selectedAssets.length} selected {selectedAssets.length === 1 ? "asset" : "assets"} · Apply sequence templates or regex patterns
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close bulk rename dialog"
            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Mode Tabs & Reset */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
              <button
                type="button"
                onClick={() => setRule((prev) => ({ ...prev, mode: "sequence" }))}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  rule.mode === "sequence"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Sequence Template
              </button>
              <button
                type="button"
                onClick={() => setRule((prev) => ({ ...prev, mode: "regex" }))}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  rule.mode === "regex"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Regex Find &amp; Replace
              </button>
            </div>

            <button
              type="button"
              onClick={() => setRule(DEFAULT_BULK_RENAME_RULE)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Rule
            </button>
          </div>

          {rule.mode === "sequence" ? (
            <div className="space-y-4">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="rename-template-input"
                    className="text-xs font-medium text-slate-700"
                  >
                    Naming Template
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-500">Insert:</span>
                    {SEQUENCE_TOKENS.map((tok) => (
                      <button
                        key={tok.label}
                        type="button"
                        title={tok.title}
                        onClick={() => insertToken(tok.label)}
                        className="px-2 py-0.5 text-[11px] font-mono text-teal-800 bg-slate-100 border border-slate-200 rounded hover:bg-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {tok.label}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  id="rename-template-input"
                  type="text"
                  value={rule.template}
                  onChange={(e) =>
                    setRule((prev) => ({ ...prev, template: e.target.value }))
                  }
                  placeholder="e.g. prefix_001.jpg or {style}_{seq:3}"
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Enter tokens like <span className="font-mono text-slate-700">{`{style}_{seq:3}`}</span> or a numbered example like <span className="font-mono text-slate-700">prefix_001.jpg</span>.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label
                    htmlFor="seq-start-input"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Start Number
                  </label>
                  <input
                    id="seq-start-input"
                    type="number"
                    min={0}
                    max={999999}
                    value={rule.startAt}
                    onChange={(e) => {
                      const val = Math.max(0, Math.round(Number(e.target.value) || 0));
                      setRule((prev) => ({ ...prev, startAt: val }));
                    }}
                    className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-teal-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="seq-step-input"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Step
                  </label>
                  <input
                    id="seq-step-input"
                    type="number"
                    min={1}
                    max={1000}
                    value={rule.step}
                    onChange={(e) => {
                      const val = Math.max(1, Math.round(Number(e.target.value) || 1));
                      setRule((prev) => ({ ...prev, step: val }));
                    }}
                    className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-teal-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="seq-pad-select"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Zero Padding
                  </label>
                  <select
                    id="seq-pad-select"
                    value={rule.padDigits}
                    onChange={(e) =>
                      setRule((prev) => ({
                        ...prev,
                        padDigits: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-teal-600"
                  >
                    <option value={1}>1 digit (1, 2)</option>
                    <option value={2}>2 digits (01, 02)</option>
                    <option value={3}>3 digits (001, 002)</option>
                    <option value={4}>4 digits (0001, 0002)</option>
                    <option value={5}>5 digits (00001)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="seq-ext-select"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Extension
                  </label>
                  <select
                    id="seq-ext-select"
                    value={rule.extensionBehavior}
                    onChange={(e) =>
                      setRule((prev) => ({
                        ...prev,
                        extensionBehavior: e.target.value as "auto" | "keep",
                      }))
                    }
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-teal-600"
                  >
                    <option value="auto">Use template ext if typed</option>
                    <option value="keep">Keep existing extension</option>
                  </select>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rule.perFolder}
                  onChange={(e) =>
                    setRule((prev) => ({ ...prev, perFolder: e.target.checked }))
                  }
                  className="w-3.5 h-3.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                />
                Reset numbering back to start inside each style folder
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="regex-pattern-input"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Find Regex Pattern
                  </label>
                  <input
                    id="regex-pattern-input"
                    type="text"
                    value={rule.pattern}
                    onChange={(e) =>
                      setRule((prev) => ({ ...prev, pattern: e.target.value }))
                    }
                    placeholder="e.g. ^IMG_(\d+)|[\s-]+"
                    className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label
                      htmlFor="regex-replace-input"
                      className="text-xs font-medium text-slate-700"
                    >
                      Replace With
                    </label>
                    <div className="flex items-center gap-1">
                      {["$1", "{style}", "{seq:3}"].map((tok) => (
                        <button
                          key={tok}
                          type="button"
                          onClick={() => insertToken(tok)}
                          className="px-1.5 py-0.5 text-[10px] font-mono text-teal-800 bg-slate-100 border border-slate-200 rounded hover:bg-slate-200 cursor-pointer"
                        >
                          {tok}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    id="regex-replace-input"
                    type="text"
                    value={rule.replacement}
                    onChange={(e) =>
                      setRule((prev) => ({
                        ...prev,
                        replacement: e.target.value,
                      }))
                    }
                    placeholder="e.g. {style}_$1_{seq:3}"
                    className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-5">
                <div className="inline-flex items-center gap-2">
                  <label
                    htmlFor="regex-target-select"
                    className="text-xs font-medium text-slate-700"
                  >
                    Match On
                  </label>
                  <select
                    id="regex-target-select"
                    value={rule.matchTarget}
                    onChange={(e) =>
                      setRule((prev) => ({
                        ...prev,
                        matchTarget: e.target.value as "stem" | "full",
                      }))
                    }
                    className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-teal-600"
                  >
                    <option value="stem">File name (without extension)</option>
                    <option value="full">Full file name (with extension)</option>
                  </select>
                </div>

                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rule.flagCaseInsensitive}
                    onChange={(e) =>
                      setRule((prev) => ({
                        ...prev,
                        flagCaseInsensitive: e.target.checked,
                      }))
                    }
                    className="w-3.5 h-3.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  />
                  Case-insensitive (i)
                </label>

                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rule.flagGlobal}
                    onChange={(e) =>
                      setRule((prev) => ({
                        ...prev,
                        flagGlobal: e.target.checked,
                      }))
                    }
                    className="w-3.5 h-3.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  />
                  Replace all occurrences (g)
                </label>
              </div>

              {plan.error && (
                <div className="px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md font-mono">
                  Invalid regex: {plan.error}
                </div>
              )}
            </div>
          )}

          {/* Live Before -> After Preview */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-900">
                Live Rename Preview
              </span>
              <span className="font-mono tabular-nums text-slate-500">
                {plan.changedCount} of {selectedAssets.length} will change
                {dedupedCount > 0
                  ? ` · ${dedupedCount} auto-numbered to avoid duplicates`
                  : ""}
              </span>
            </div>

            <div className="border border-slate-200 rounded-md overflow-hidden max-h-[260px] overflow-y-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-medium text-slate-500 sticky top-0">
                  <tr>
                    <th className="py-2 px-3 w-14 font-mono">Row</th>
                    <th className="py-2 px-3">Style Folder</th>
                    <th className="py-2 px-3">Current File Name</th>
                    <th className="py-2 px-1 w-6" aria-hidden="true" />
                    <th className="py-2 px-3">New File Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {plan.items.slice(0, 200).map((item) => (
                    <tr key={item.assetId} className="hover:bg-slate-50/70">
                      <td className="py-1.5 px-3 font-mono tabular-nums text-slate-400">
                        {item.rowIndex}
                      </td>
                      <td className="py-1.5 px-3 font-mono text-slate-600 max-w-[140px] truncate">
                        {item.styleFolder}/
                      </td>
                      <td
                        className="py-1.5 px-3 font-mono text-slate-500 max-w-[200px] truncate"
                        title={item.oldFileName}
                      >
                        {item.oldFileName}
                      </td>
                      <td className="py-1.5 px-1 text-slate-400">
                        <ArrowRight className="w-3 h-3" />
                      </td>
                      <td
                        className={`py-1.5 px-3 font-mono max-w-[240px] truncate ${
                          item.changed
                            ? "text-teal-800 font-medium"
                            : "text-slate-400"
                        }`}
                        title={item.newTargetPath}
                      >
                        {item.newFileName}
                      </td>
                    </tr>
                  ))}
                  {plan.items.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-8 px-4 text-center text-slate-500"
                      >
                        {plan.error
                          ? "Fix the regular expression above to preview renames."
                          : "No selected assets to preview."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {plan.items.length > 200 && (
                <div className="px-3 py-2 border-t border-slate-100 bg-slate-50 text-[11px] font-mono tabular-nums text-slate-500">
                  Showing first 200 of {plan.items.length} selected items. All {plan.items.length} will be renamed on apply.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0 bg-white rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={Boolean(plan.error) || plan.changedCount === 0}
            className="px-4 py-2 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800 disabled:opacity-45 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Apply Rename ({plan.changedCount})
          </button>
        </div>
      </div>
    </div>
  );
}

import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { FileSpreadsheet, Upload, ClipboardPaste, RotateCcw, X } from "lucide-react";
import type { WorkbookData } from "../types/asset.ts";

interface UploadZoneProps {
  workbook: WorkbookData | null;
  activeSheetIndex: number;
  onSelectSheet: (index: number) => void;
  onFileSelected: (file: File) => void;
  onPasteRows: (tsvText: string) => void;
  onClearSession?: () => void;
  disabled?: boolean;
  isParsing: boolean;
  parseError: string | null;
}

export function UploadZone({
  workbook,
  activeSheetIndex,
  onSelectSheet,
  onFileSelected,
  onPasteRows,
  onClearSession,
  disabled = false,
  isParsing,
  parseError,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteDraft, setPasteDraft] = useState("");

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onFileSelected(file);
    }
  };

  const handlePasteSubmit = () => {
    if (!pasteDraft.trim()) return;
    onPasteRows(pasteDraft);
    setPasteDraft("");
    setShowPasteModal(false);
  };

  return (
    <section id="upload-section" className="bg-white border border-slate-200 rounded-lg">
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <FileSpreadsheet className="w-5 h-5 text-teal-700 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">
              01. Excel or CSV Source
            </h2>
            {workbook ? (
              <p className="text-xs text-slate-500 truncate mt-0.5">
                <span className="font-mono text-slate-700">{workbook.fileName}</span>
                <span aria-hidden="true"> · </span>
                <span className="font-mono tabular-nums">
                  {workbook.sheets[activeSheetIndex]?.rows.length ?? 0} rows
                </span>
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-0.5">
                Upload your .xlsx, .xls, or .csv sheet containing style names, file names, and Shopify CDN links.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {workbook && onClearSession && (
            <button
              type="button"
              onClick={onClearSession}
              disabled={disabled || isParsing}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear Session
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowPasteModal(true)}
            disabled={disabled || isParsing}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            Paste Rows
          </button>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isParsing || disabled}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            {workbook ? "Replace File" : "Upload Excel"}
          </button>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelected(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {!workbook ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={`m-4 border border-dashed rounded-md px-6 py-10 text-center transition-colors cursor-pointer ${
            isDragging
              ? "border-teal-600 bg-teal-50/50"
              : "border-slate-300 bg-slate-50/60 hover:border-slate-400 hover:bg-slate-50"
          }`}
        >
          <p className="text-sm font-medium text-slate-800">
            {isParsing
              ? "Reading spreadsheet..."
              : "Drop your Excel (.xlsx, .xls) or CSV file here, or click to browse"}
          </p>
          <p className="text-xs text-slate-500 mt-1.5 max-w-xl mx-auto">
            Supports single or multiple Shopify CDN link columns per row, custom style folder names, and custom target filenames.
          </p>
        </div>
      ) : (
        workbook.sheets.length > 1 && (
          <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center gap-2 overflow-x-auto">
            <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">
              Worksheet:
            </span>
            <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 rounded-md">
              {workbook.sheets.map((sheet, idx) => (
                <button
                  key={sheet.name}
                  type="button"
                  onClick={() => onSelectSheet(idx)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    idx === activeSheetIndex
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {sheet.name} ({sheet.rows.length})
                </button>
              ))}
            </div>
          </div>
        )
      )}

      {parseError && (
        <div className="mx-5 mb-4 px-3.5 py-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
          {parseError}
        </div>
      )}

      {showPasteModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="paste-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-2xl shadow-lg">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 id="paste-modal-title" className="text-sm font-semibold text-slate-900">
                Paste Rows from Excel or Google Sheets
              </h3>
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                aria-label="Close paste dialog"
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600">
                Copy rows directly from Excel (including the header row) and paste them below. Tab-separated and comma-separated values are both supported.
              </p>
              <textarea
                value={pasteDraft}
                onChange={(e) => setPasteDraft(e.target.value)}
                rows={8}
                placeholder={`Style\tFile Name\tShopify CDN Link\nST-101\tST-101_front\thttps://cdn.shopify.com/s/files/...`}
                className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-teal-600 focus:bg-white"
              />
            </div>
            <div className="px-5 py-3.5 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePasteSubmit}
                disabled={!pasteDraft.trim()}
                className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Load Pasted Data
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

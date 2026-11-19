import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  ImageOff,
  Loader2,
  Maximize2,
  Minimize2,
  ShieldCheck,
  Unlink,
  X,
} from "lucide-react";
import type { PlannedAsset } from "../types/asset.ts";
import { formatBytes } from "../utils/fileNaming.ts";

interface ImagePreviewPanelProps {
  asset: PlannedAsset | null;
  currentIndex: number;
  totalCount: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function ImagePreviewPanel({
  asset,
  currentIndex,
  totalCount,
  onClose,
  onPrevious,
  onNext,
}: ImagePreviewPanelProps) {
  const [imageState, setImageState] = useState<"loading" | "loaded" | "error">(
    "loading"
  );
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [actualSizeView, setActualSizeView] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const imageSrc = asset ? asset.previewUrl || asset.sourceUrl : "";

  useEffect(() => {
    if (!asset) return;
    setImageState(asset.status === "broken" ? "error" : "loading");
    setDimensions(null);
    setActualSizeView(false);
    setCopiedUrl(false);
  }, [asset?.id, imageSrc, asset?.status]);

  useEffect(() => {
    if (!asset) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && currentIndex > 0) {
        onPrevious();
      } else if (e.key === "ArrowRight" && currentIndex < totalCount - 1) {
        onNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [asset, currentIndex, totalCount, onClose, onPrevious, onNext]);

  if (!asset) return null;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(asset.sourceUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 1800);
    } catch {
      // Clipboard write unavailable
    }
  };

  const handleDownloadSingle = () => {
    if (!asset.blob) return;
    const url = URL.createObjectURL(asset.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = asset.targetFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex justify-end"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-panel-title"
    >
      <aside
        className="bg-white w-full max-w-xl h-full border-l border-slate-200 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h3
              id="preview-panel-title"
              className="text-sm font-semibold font-mono text-slate-900 truncate"
              title={asset.targetFileName}
            >
              {asset.targetFileName}
            </h3>
            <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5 truncate">
              Row {asset.rowIndex} · {asset.styleFolder}/ ·{" "}
              {currentIndex + 1} of {totalCount}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onPrevious}
              disabled={currentIndex <= 0}
              aria-label="Previous image"
              title="Previous row (Left arrow)"
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md disabled:opacity-35 cursor-pointer disabled:cursor-default"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={currentIndex >= totalCount - 1}
              aria-label="Next image"
              title="Next row (Right arrow)"
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md disabled:opacity-35 cursor-pointer disabled:cursor-default"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview panel"
              title="Close (Esc)"
              className="p-1.5 ml-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Image Stage */}
        <div className="relative flex-1 min-h-[280px] bg-slate-100 border-b border-slate-200 overflow-auto flex items-center justify-center p-5">
          {imageState === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500 bg-slate-100/90 z-10">
              <Loader2 className="w-5 h-5 animate-spin text-teal-700" />
              <span className="text-xs">Loading image preview...</span>
            </div>
          )}

          {imageState === "error" ? (
            <div className="max-w-sm text-center px-6 py-8 bg-white border border-slate-200 rounded-lg">
              <ImageOff className="w-8 h-8 text-red-500 mx-auto mb-2.5" />
              <p className="text-sm font-medium text-slate-900">
                Preview unavailable
              </p>
              <p className="text-xs text-slate-600 mt-1">
                {asset.errorMessage
                  ? `The Shopify CDN link could not be loaded (${asset.errorMessage}).`
                  : "This image URL could not be loaded directly in the browser preview."}
              </p>
            </div>
          ) : (
            <img
              key={imageSrc}
              src={imageSrc}
              alt={asset.targetFileName}
              referrerPolicy="no-referrer"
              onLoad={(e) => {
                const img = e.currentTarget;
                setDimensions({
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                });
                setImageState("loaded");
              }}
              onError={() => setImageState("error")}
              className={
                actualSizeView
                  ? "max-w-none rounded border border-slate-200 bg-white shadow-xs"
                  : "max-h-full max-w-full object-contain rounded border border-slate-200 bg-white shadow-xs"
              }
            />
          )}

          {imageState === "loaded" && (
            <button
              type="button"
              onClick={() => setActualSizeView((v) => !v)}
              className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-slate-800 bg-white/95 border border-slate-200 rounded-md shadow-xs hover:bg-white cursor-pointer"
            >
              {actualSizeView ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  Fit to Frame
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  Actual Size
                </>
              )}
            </button>
          )}
        </div>

        {/* Metadata & Actions */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[42vh] shrink-0 bg-white">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
            <div>
              <span className="block text-[11px] text-slate-500">
                Target Path
              </span>
              <span className="font-mono font-medium text-slate-900 break-all">
                {asset.targetPath}
              </span>
            </div>

            <div>
              <span className="block text-[11px] text-slate-500">Status</span>
              <span className="inline-flex items-center gap-1.5 mt-0.5 font-medium">
                {asset.status === "ready" && (
                  <>
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-700">Ready</span>
                  </>
                )}
                {asset.status === "validating" && (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-700" />
                    <span className="text-slate-700">Checking link</span>
                  </>
                )}
                {asset.status === "reachable" && (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
                    <span className="text-teal-700">Active &amp; Reachable</span>
                  </>
                )}
                {asset.status === "broken" && (
                  <>
                    <Unlink className="w-3.5 h-3.5 text-red-700" />
                    <span className="text-red-700">
                      Broken · {asset.errorMessage || "Unreachable"}
                    </span>
                  </>
                )}
                {asset.status === "fetching" && (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-700" />
                    <span className="text-teal-700">Fetching</span>
                  </>
                )}
                {asset.status === "saved" && (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                    <span className="text-emerald-700">Saved locally</span>
                  </>
                )}
                {asset.status === "failed" && (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-red-700" />
                    <span className="text-red-700">
                      Failed · {asset.errorMessage || "Download error"}
                    </span>
                  </>
                )}
                {asset.status === "skipped" && (
                  <span className="text-slate-500">Skipped (duplicate)</span>
                )}
              </span>
            </div>

            <div>
              <span className="block text-[11px] text-slate-500">
                Dimensions &amp; Size
              </span>
              <span className="font-mono tabular-nums text-slate-800">
                {dimensions
                  ? `${dimensions.width} × ${dimensions.height} px`
                  : asset.imageWidth && asset.imageHeight
                    ? `${asset.imageWidth} × ${asset.imageHeight} px`
                    : "—"}
                {" · "}
                {formatBytes(asset.byteSize)}
              </span>
            </div>

            <div>
              <span className="block text-[11px] text-slate-500">
                Source Column
              </span>
              <span className="font-mono text-slate-800">
                {asset.sourceColumn}
                {asset.contentType ? ` · ${asset.contentType}` : ""}
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <span className="block text-[11px] text-slate-500 mb-1">
              Shopify CDN Link
            </span>
            <p className="font-mono text-[11px] text-slate-700 break-all bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
              {asset.sourceUrl}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyUrl}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedUrl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy URL
                  </>
                )}
              </button>

              <a
                href={asset.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open Source
              </a>
            </div>

            {asset.blob && (
              <button
                type="button"
                onClick={handleDownloadSingle}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download File
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

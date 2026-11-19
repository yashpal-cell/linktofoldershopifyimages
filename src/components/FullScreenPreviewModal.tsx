import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Copy,
  Check,
  Download,
  ExternalLink,
  ImageOff,
  Loader2,
  Maximize2,
  RefreshCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { MappingConfig, PlannedAsset } from "../types/asset.ts";
import { formatBytes } from "../utils/fileNaming.ts";
import { fetchSingleAsset } from "../utils/packager.ts";

type CompareMode = "side-by-side" | "original" | "converted";

interface ImageMetrics {
  state: "loading" | "loaded" | "error";
  width?: number;
  height?: number;
}

interface EphemeralPreview {
  assetId: string;
  previewUrl: string;
  blob: Blob;
  byteSize: number;
  contentType?: string;
  detectedExtension?: string;
  imageWidth?: number;
  imageHeight?: number;
}

interface FullScreenPreviewModalProps {
  asset: PlannedAsset | null;
  currentIndex: number;
  totalCount: number;
  mapping: MappingConfig;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function FullScreenPreviewModal({
  asset,
  currentIndex,
  totalCount,
  mapping,
  onClose,
  onPrevious,
  onNext,
}: FullScreenPreviewModalProps) {
  const [compareMode, setCompareMode] = useState<CompareMode>("side-by-side");
  const [zoomScale, setZoomScale] = useState<number | "fit">("fit");
  const [originalMetrics, setOriginalMetrics] = useState<ImageMetrics>({
    state: "loading",
  });
  const [convertedMetrics, setConvertedMetrics] = useState<ImageMetrics>({
    state: "loading",
  });
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [ephemeralPreview, setEphemeralPreview] =
    useState<EphemeralPreview | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewGenError, setPreviewGenError] = useState<string | null>(null);

  const activeConvertedUrl =
    asset?.previewUrl ||
    (ephemeralPreview && asset && ephemeralPreview.assetId === asset.id
      ? ephemeralPreview.previewUrl
      : undefined);

  const activeConvertedBlob =
    asset?.blob ||
    (ephemeralPreview && asset && ephemeralPreview.assetId === asset.id
      ? ephemeralPreview.blob
      : undefined);

  const activeConvertedBytes =
    ephemeralPreview && asset && ephemeralPreview.assetId === asset.id
      ? ephemeralPreview.byteSize
      : asset?.byteSize;

  const activeConvertedContentType =
    ephemeralPreview && asset && ephemeralPreview.assetId === asset.id
      ? ephemeralPreview.contentType
      : asset?.contentType;

  // Revoke any ephemeral preview URL when replaced or unmounted
  useEffect(() => {
    return () => {
      if (ephemeralPreview?.previewUrl) {
        URL.revokeObjectURL(ephemeralPreview.previewUrl);
      }
    };
  }, [ephemeralPreview]);

  // Reset per-asset state when switching rows
  useEffect(() => {
    if (!asset) return;
    setOriginalMetrics({
      state: asset.status === "broken" ? "error" : "loading",
    });
    setConvertedMetrics({
      state: asset.previewUrl ? "loading" : "error",
    });
    setCompareMode(asset.previewUrl ? "side-by-side" : "original");
    setZoomScale("fit");
    setCopiedUrl(false);
    setPreviewGenError(null);
    setEphemeralPreview((prev) => {
      if (prev && prev.assetId !== asset.id) {
        return null;
      }
      return prev;
    });
  }, [asset?.id, asset?.previewUrl, asset?.status]);

  // Keyboard navigation & zoom shortcuts
  useEffect(() => {
    if (!asset) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && currentIndex > 0) {
        onPrevious();
      } else if (e.key === "ArrowRight" && currentIndex < totalCount - 1) {
        onNext();
      } else if (e.key === "=" || e.key === "+") {
        setZoomScale((prev) => {
          const current = prev === "fit" ? 1 : prev;
          return Math.min(4, Number((current + 0.25).toFixed(2)));
        });
      } else if (e.key === "-") {
        setZoomScale((prev) => {
          const current = prev === "fit" ? 1 : prev;
          const next = Number((current - 0.25).toFixed(2));
          return next <= 0.25 ? "fit" : next;
        });
      } else if (e.key === "0") {
        setZoomScale("fit");
      } else if (e.key === "1") {
        setZoomScale(1);
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
      // Clipboard unavailable
    }
  };

  const handleDownloadConverted = () => {
    if (!activeConvertedBlob) return;
    const url = URL.createObjectURL(activeConvertedBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = asset.targetFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const handleGenerateConvertedPreview = async () => {
    if (!asset || isGeneratingPreview) return;
    setIsGeneratingPreview(true);
    setPreviewGenError(null);
    const result = await fetchSingleAsset(asset, mapping);
    setIsGeneratingPreview(false);

    if (result.ok && result.blob && result.previewUrl) {
      setEphemeralPreview({
        assetId: asset.id,
        previewUrl: result.previewUrl,
        blob: result.blob,
        byteSize: result.byteSize ?? result.blob.size,
        contentType: result.contentType,
        detectedExtension: result.detectedExtension,
        imageWidth: result.imageWidth,
        imageHeight: result.imageHeight,
      });
      setConvertedMetrics({
        state: "loading",
        width: result.imageWidth,
        height: result.imageHeight,
      });
      setCompareMode("side-by-side");
    } else {
      if (result.previewUrl) {
        URL.revokeObjectURL(result.previewUrl);
      }
      setPreviewGenError(
        result.errorMessage || "Unable to generate converted preview."
      );
    }
  };

  const zoomPercentLabel =
    zoomScale === "fit" ? "Fit" : `${Math.round(zoomScale * 100)}%`;

  const renderZoomableImage = (
    src: string,
    alt: string,
    metrics: ImageMetrics,
    onLoadMetrics: (w: number, h: number) => void,
    onErrorMetrics: () => void
  ) => {
    const isFit = zoomScale === "fit";
    const scaledWidth =
      !isFit && metrics.width ? Math.round(metrics.width * zoomScale) : undefined;

    return (
      <div
        className={`relative flex-1 min-h-0 overflow-auto flex ${
          isFit ? "items-center justify-center p-4" : "items-start justify-center p-6"
        }`}
        style={{
          backgroundImage:
            "linear-gradient(45deg, rgba(255,255,255,0.035) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.035) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.035) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.035) 75%)",
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
        }}
      >
        {metrics.state === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300 bg-slate-950/60 z-10 pointer-events-none">
            <Loader2 className="w-5 h-5 animate-spin text-teal-400" />
            <span className="text-xs">Loading high-resolution image...</span>
          </div>
        )}

        {metrics.state === "error" ? (
          <div className="my-auto max-w-sm text-center px-6 py-8 bg-slate-900 border border-slate-800 rounded-lg">
            <ImageOff className="w-8 h-8 text-red-400 mx-auto mb-2.5" />
            <p className="text-sm font-medium text-slate-100">
              Image unavailable
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {asset.errorMessage ||
                "This image could not be loaded for high-resolution preview."}
            </p>
          </div>
        ) : (
          <img
            key={`${src}-${zoomScale}`}
            src={src}
            alt={alt}
            referrerPolicy="no-referrer"
            onClick={() =>
              setZoomScale((prev) => (prev === "fit" ? 1 : "fit"))
            }
            onLoad={(e) => {
              const img = e.currentTarget;
              onLoadMetrics(img.naturalWidth, img.naturalHeight);
            }}
            onError={onErrorMetrics}
            style={
              scaledWidth
                ? { width: `${scaledWidth}px`, maxWidth: "none" }
                : undefined
            }
            className={
              isFit
                ? "max-h-full max-w-full object-contain rounded border border-slate-800 bg-white/5 cursor-zoom-in"
                : "h-auto max-w-none rounded border border-slate-700 bg-white/5 cursor-zoom-out"
            }
          />
        )}
      </div>
    );
  };

  const hasTransformConfigured =
    mapping.outputFormat !== "original" || mapping.resizeEnabled;

  const originalSummaryDims =
    originalMetrics.width && originalMetrics.height
      ? `${originalMetrics.width} × ${originalMetrics.height} px`
      : "—";

  const convertedDisplayWidth = convertedMetrics.width ?? asset.imageWidth;
  const convertedDisplayHeight = convertedMetrics.height ?? asset.imageHeight;
  const convertedSummaryDims =
    convertedDisplayWidth && convertedDisplayHeight
      ? `${convertedDisplayWidth} × ${convertedDisplayHeight} px`
      : "—";

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-950/95 text-slate-100 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fullscreen-preview-title"
    >
      {/* Top Bar */}
      <div className="px-5 py-3 border-b border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onPrevious}
              disabled={currentIndex <= 0}
              aria-label="Previous image"
              title="Previous image (Left arrow)"
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-md disabled:opacity-30 cursor-pointer disabled:cursor-default"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={currentIndex >= totalCount - 1}
              aria-label="Next image"
              title="Next image (Right arrow)"
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-md disabled:opacity-30 cursor-pointer disabled:cursor-default"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="min-w-0">
            <h2
              id="fullscreen-preview-title"
              className="text-sm font-semibold font-mono text-white truncate max-w-[320px] sm:max-w-[440px]"
              title={asset.targetPath}
            >
              {asset.targetFileName}
            </h2>
            <p className="text-xs text-slate-400 font-mono tabular-nums truncate">
              Row {asset.rowIndex} · {asset.styleFolder}/ ·{" "}
              {currentIndex + 1} of {totalCount}
            </p>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-md shrink-0">
          <button
            type="button"
            onClick={() => setCompareMode("side-by-side")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              compareMode === "side-by-side"
                ? "bg-teal-700 text-white"
                : "text-slate-300 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            Side-by-Side
          </button>
          <button
            type="button"
            onClick={() => setCompareMode("original")}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              compareMode === "original"
                ? "bg-teal-700 text-white"
                : "text-slate-300 hover:text-white hover:bg-slate-800"
            }`}
          >
            Original
          </button>
          <button
            type="button"
            onClick={() => setCompareMode("converted")}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              compareMode === "converted"
                ? "bg-teal-700 text-white"
                : "text-slate-300 hover:text-white hover:bg-slate-800"
            }`}
          >
            Converted
          </button>
        </div>

        {/* Zoom & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex items-center border border-slate-800 bg-slate-900 rounded-md">
            <button
              type="button"
              onClick={() =>
                setZoomScale((prev) => {
                  const cur = prev === "fit" ? 1 : prev;
                  const next = Number((cur - 0.25).toFixed(2));
                  return next <= 0.25 ? "fit" : next;
                })
              }
              aria-label="Zoom out"
              title="Zoom out (-)"
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-l-md cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                setZoomScale((prev) => (prev === "fit" ? 1 : "fit"))
              }
              title="Toggle Fit / 100% actual pixels (0 / 1)"
              className="px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-200 hover:text-white hover:bg-slate-800 min-w-[54px] text-center whitespace-nowrap cursor-pointer"
            >
              {zoomPercentLabel}
            </button>
            <button
              type="button"
              onClick={() =>
                setZoomScale((prev) => {
                  const cur = prev === "fit" ? 1 : prev;
                  return Math.min(4, Number((cur + 0.25).toFixed(2)));
                })
              }
              aria-label="Zoom in"
              title="Zoom in (+)"
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-r-md cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {activeConvertedBlob && (
            <button
              type="button"
              onClick={handleDownloadConverted}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-950 bg-white rounded-md hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close full-screen preview"
            title="Close (Esc)"
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* High-Resolution Canvas Stage */}
      <div className="flex-1 min-h-0 p-4 overflow-hidden">
        <div
          className={`h-full grid gap-4 ${
            compareMode === "side-by-side"
              ? "grid-cols-1 lg:grid-cols-2"
              : "grid-cols-1"
          }`}
        >
          {(compareMode === "side-by-side" || compareMode === "original") && (
            <div className="flex flex-col min-h-0 border border-slate-800 rounded-lg bg-slate-900/50 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between gap-3 shrink-0">
                <span className="text-xs font-semibold text-white">
                  Original Source Image
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-400 truncate">
                  {originalSummaryDims} · Shopify CDN
                </span>
              </div>
              {renderZoomableImage(
                asset.sourceUrl,
                `${asset.targetFileName} original`,
                originalMetrics,
                (w, h) =>
                  setOriginalMetrics({ state: "loaded", width: w, height: h }),
                () => setOriginalMetrics({ state: "error" })
              )}
            </div>
          )}

          {(compareMode === "side-by-side" || compareMode === "converted") && (
            <div className="flex flex-col min-h-0 border border-slate-800 rounded-lg bg-slate-900/50 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold text-white whitespace-nowrap">
                    Converted Output
                  </span>
                  {asset.needsTransform && (
                    <span className="text-[11px] font-mono text-amber-300 truncate">
                      · Settings changed (re-convert needed)
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-400 whitespace-nowrap shrink-0">
                  {convertedSummaryDims} · {formatBytes(activeConvertedBytes)}
                  {activeConvertedContentType
                    ? ` · ${activeConvertedContentType.replace("image/", "").toUpperCase()}`
                    : ""}
                </span>
              </div>

              {activeConvertedUrl ? (
                renderZoomableImage(
                  activeConvertedUrl,
                  `${asset.targetFileName} converted`,
                  convertedMetrics,
                  (w, h) =>
                    setConvertedMetrics({
                      state: "loaded",
                      width: w,
                      height: h,
                    }),
                  () => setConvertedMetrics({ state: "error" })
                )
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  <Maximize2 className="w-8 h-8 text-slate-500 mb-3" />
                  <p className="text-sm font-medium text-slate-200">
                    Converted output not downloaded yet
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    {hasTransformConfigured
                      ? `Preview how this image looks after converting to ${
                          mapping.outputFormat === "original"
                            ? "its original format"
                            : mapping.outputFormat.toUpperCase()
                        }${
                          mapping.resizeEnabled
                            ? ` (${mapping.targetWidth ?? "auto"}×${mapping.targetHeight ?? "auto"} px)`
                            : ""
                        }.`
                      : "Fetch this image to inspect the downloaded file alongside the original Shopify CDN source."}
                  </p>
                  {previewGenError && (
                    <p className="text-xs text-red-400 mt-2 max-w-sm">
                      {previewGenError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleGenerateConvertedPreview}
                    disabled={isGeneratingPreview || asset.status === "broken"}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-600 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isGeneratingPreview ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Generating Preview...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        Generate Converted Preview
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Metadata Bar */}
      <div className="px-5 py-2.5 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-4 text-xs shrink-0">
        <div className="flex items-center gap-3 min-w-0 max-w-2xl">
          <span
            className="font-mono text-[11px] text-slate-400 truncate"
            title={asset.sourceUrl}
          >
            {asset.sourceUrl}
          </span>
          <button
            type="button"
            onClick={handleCopyUrl}
            className="inline-flex items-center gap-1 text-slate-300 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedUrl ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy
              </>
            )}
          </button>
          <a
            href={asset.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-slate-300 hover:text-white whitespace-nowrap shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open
          </a>
        </div>

        <div className="text-[11px] font-mono tabular-nums text-slate-400 whitespace-nowrap shrink-0">
          <span>Target: {asset.targetPath}</span>
          <span aria-hidden="true"> · </span>
          <span>Click image to toggle Fit / 100%</span>
        </div>
      </div>
    </div>
  );
}

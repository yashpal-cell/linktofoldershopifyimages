import { SlidersHorizontal } from "lucide-react";
import type {
  DuplicatePolicy,
  MappingConfig,
  OutputImageFormat,
  ResizeFitMode,
} from "../types/asset.ts";

interface ColumnMapperProps {
  headers: string[];
  config: MappingConfig;
  onChange: (next: MappingConfig) => void;
  disabled?: boolean;
}

const DIMENSION_PRESETS = [
  { label: "Custom", width: null, height: null },
  { label: "800 × 800", width: 800, height: 800 },
  { label: "1000 × 1000 (Square)", width: 1000, height: 1000 },
  { label: "1200 × 1200 (Shopify)", width: 1200, height: 1200 },
  { label: "2048 × 2048 (HD)", width: 2048, height: 2048 },
  { label: "1080 × 1440 (3:4)", width: 1080, height: 1440 },
];

export function ColumnMapper({
  headers,
  config,
  onChange,
  disabled = false,
}: ColumnMapperProps) {
  const toggleUrlColumn = (header: string) => {
    const exists = config.urlColumns.includes(header);
    const nextUrls = exists
      ? config.urlColumns.filter((h) => h !== header)
      : [...config.urlColumns, header];
    onChange({ ...config, urlColumns: nextUrls });
  };

  const supportsLossyQuality =
    config.outputFormat === "jpg" ||
    config.outputFormat === "webp" ||
    config.outputFormat === "avif" ||
    config.outputFormat === "tiff";

  const showBackgroundControl =
    config.outputFormat === "jpg" ||
    (config.resizeEnabled && config.resizeFit === "contain");

  const activePresetValue = (() => {
    if (!config.resizeEnabled) return "";
    const found = DIMENSION_PRESETS.find(
      (p) =>
        p.width !== null &&
        p.width === config.targetWidth &&
        p.height === config.targetHeight
    );
    return found ? `${found.width}x${found.height}` : "custom";
  })();

  return (
    <section id="mapping-section" className="bg-white border border-slate-200 rounded-lg">
      <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <SlidersHorizontal className="w-4 h-4 text-teal-700 shrink-0" />
          <h2 className="text-sm font-semibold text-slate-900">
            02. Column Mapping, Format &amp; Resize Rules
          </h2>
        </div>
        <p className="text-xs text-slate-500">
          Map Excel columns and set target image format or pixel dimensions before exporting.
        </p>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <label
              htmlFor="style-col-select"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Style / Folder Name Column
            </label>
            <select
              id="style-col-select"
              disabled={disabled}
              value={config.styleColumn}
              onChange={(e) =>
                onChange({ ...config, styleColumn: e.target.value })
              }
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-teal-600 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">None (Single folder)</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="filename-col-select"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              File Name Column
            </label>
            <select
              id="filename-col-select"
              disabled={disabled}
              value={config.fileNameColumn}
              onChange={(e) =>
                onChange({ ...config, fileNameColumn: e.target.value })
              }
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-teal-600 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">Auto from CDN URL</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="root-folder-input"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Root Folder Name (Optional)
            </label>
            <input
              id="root-folder-input"
              type="text"
              disabled={disabled}
              value={config.rootFolderName}
              onChange={(e) =>
                onChange({ ...config, rootFolderName: e.target.value })
              }
              placeholder="Leave blank for style folders at root"
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>

          <div>
            <label
              htmlFor="duplicate-policy-select"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Duplicate File Names
            </label>
            <select
              id="duplicate-policy-select"
              disabled={disabled}
              value={config.duplicatePolicy}
              onChange={(e) =>
                onChange({
                  ...config,
                  duplicatePolicy: e.target.value as DuplicatePolicy,
                })
              }
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-teal-600 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="number">Auto-number (name_2, name_3)</option>
              <option value="skip">Skip duplicate row</option>
              <option value="overwrite">Keep same name</option>
            </select>
          </div>
        </div>

        {/* Format & Dimension Conversion Controls */}
        <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-3">
            <label
              htmlFor="output-format-select"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Convert Output Format
            </label>
            <select
              id="output-format-select"
              disabled={disabled}
              value={config.outputFormat}
              onChange={(e) =>
                onChange({
                  ...config,
                  outputFormat: e.target.value as OutputImageFormat,
                })
              }
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-teal-600 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="original">Original (No conversion)</option>
              <option value="jpg">JPG (.jpg)</option>
              <option value="webp">WebP (.webp)</option>
              <option value="png">PNG (.png)</option>
              <option value="avif">AVIF (.avif)</option>
              <option value="tiff">TIFF (.tiff)</option>
              <option value="gif">GIF (.gif)</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <label
              htmlFor="output-quality-input"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Quality {supportsLossyQuality ? "(10–100)" : "(Lossless / Auto)"}
            </label>
            <div className="inline-flex w-full items-center border border-slate-200 rounded-md bg-white focus-within:border-teal-600">
              <input
                id="output-quality-input"
                type="number"
                min={10}
                max={100}
                step={5}
                disabled={disabled || !supportsLossyQuality}
                value={config.outputQuality}
                onChange={(e) => {
                  const parsed = Number(e.target.value);
                  const clamped = Number.isFinite(parsed)
                    ? Math.max(10, Math.min(100, Math.round(parsed)))
                    : 90;
                  onChange({ ...config, outputQuality: clamped });
                }}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums text-slate-900 bg-transparent focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
              />
              <span className="pr-3 text-[11px] font-mono text-slate-400 select-none">
                %
              </span>
            </div>
          </div>

          <div className="sm:col-span-2 lg:col-span-7 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={config.resizeEnabled}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      resizeEnabled: e.target.checked,
                      targetWidth:
                        e.target.checked && !config.targetWidth && !config.targetHeight
                          ? 1200
                          : config.targetWidth,
                      targetHeight:
                        e.target.checked && !config.targetWidth && !config.targetHeight
                          ? 1200
                          : config.targetHeight,
                    })
                  }
                  className="w-3.5 h-3.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                />
                Resize to Required Dimensions (px)
              </label>

              {showBackgroundControl && (
                <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
                  <span>Fill / Flatten BG:</span>
                  <input
                    type="color"
                    disabled={disabled}
                    value={config.backgroundColor}
                    onChange={(e) =>
                      onChange({ ...config, backgroundColor: e.target.value })
                    }
                    aria-label="Background fill color"
                    className="w-5 h-5 p-0 border border-slate-300 rounded cursor-pointer bg-white"
                  />
                  <span className="font-mono text-[11px] uppercase text-slate-500">
                    {config.backgroundColor}
                  </span>
                </label>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="inline-flex items-center border border-slate-200 rounded-md bg-white focus-within:border-teal-600">
                <span className="pl-2.5 text-[11px] font-mono text-slate-400 select-none">
                  W
                </span>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  disabled={disabled}
                  placeholder="Auto"
                  value={config.targetWidth ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    const parsed = raw === "" ? null : Math.max(1, Math.min(10000, Math.round(Number(raw))));
                    onChange({
                      ...config,
                      resizeEnabled: parsed !== null || config.targetHeight !== null ? true : config.resizeEnabled,
                      targetWidth: parsed && Number.isFinite(parsed) ? parsed : null,
                    });
                  }}
                  aria-label="Target width in pixels"
                  className="w-full px-2 py-2 text-xs font-mono tabular-nums text-slate-900 bg-transparent focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                />
                <span className="pr-2 text-[11px] font-mono text-slate-400 select-none">
                  px
                </span>
              </div>

              <div className="inline-flex items-center border border-slate-200 rounded-md bg-white focus-within:border-teal-600">
                <span className="pl-2.5 text-[11px] font-mono text-slate-400 select-none">
                  H
                </span>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  disabled={disabled}
                  placeholder="Auto"
                  value={config.targetHeight ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    const parsed = raw === "" ? null : Math.max(1, Math.min(10000, Math.round(Number(raw))));
                    onChange({
                      ...config,
                      resizeEnabled: parsed !== null || config.targetWidth !== null ? true : config.resizeEnabled,
                      targetHeight: parsed && Number.isFinite(parsed) ? parsed : null,
                    });
                  }}
                  aria-label="Target height in pixels"
                  className="w-full px-2 py-2 text-xs font-mono tabular-nums text-slate-900 bg-transparent focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                />
                <span className="pr-2 text-[11px] font-mono text-slate-400 select-none">
                  px
                </span>
              </div>

              <select
                disabled={disabled}
                value={activePresetValue}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    onChange({ ...config, resizeEnabled: false });
                    return;
                  }
                  if (val === "custom") {
                    onChange({ ...config, resizeEnabled: true });
                    return;
                  }
                  const [w, h] = val.split("x").map(Number);
                  if (w > 0 && h > 0) {
                    onChange({
                      ...config,
                      resizeEnabled: true,
                      targetWidth: w,
                      targetHeight: h,
                    });
                  }
                }}
                aria-label="Dimension preset"
                className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-teal-600 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">Size Preset...</option>
                {DIMENSION_PRESETS.filter((p) => p.width !== null).map((preset) => (
                  <option
                    key={`${preset.width}x${preset.height}`}
                    value={`${preset.width}x${preset.height}`}
                  >
                    {preset.label}
                  </option>
                ))}
              </select>

              <select
                disabled={disabled || !config.resizeEnabled}
                value={config.resizeFit}
                onChange={(e) =>
                  onChange({
                    ...config,
                    resizeFit: e.target.value as ResizeFitMode,
                  })
                }
                aria-label="Resize fit mode"
                className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-teal-600 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="inside">Fit Inside (No Crop)</option>
                <option value="contain">Pad to Exact Box</option>
                <option value="cover">Crop to Exact Box</option>
                <option value="fill">Stretch to Box</option>
              </select>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-slate-700">
              Shopify CDN Link Column(s)
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {headers.map((header) => {
                const selected = config.urlColumns.includes(header);
                return (
                  <button
                    key={header}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleUrlColumn(header)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                      selected
                        ? "bg-teal-700 text-white border-teal-700 font-medium"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {header}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5 shrink-0">
            <div className="inline-flex items-center gap-2">
              <label
                htmlFor="download-delay-input"
                className="text-xs font-medium text-slate-700 whitespace-nowrap"
              >
                Download Delay
              </label>
              <div className="inline-flex items-center border border-slate-200 rounded-md bg-white focus-within:border-teal-600">
                <input
                  id="download-delay-input"
                  type="number"
                  min={0}
                  max={30000}
                  step={50}
                  disabled={disabled}
                  value={config.downloadDelayMs}
                  onChange={(e) => {
                    const parsed = Number(e.target.value);
                    const clamped = Number.isFinite(parsed)
                      ? Math.max(0, Math.min(30000, Math.round(parsed)))
                      : 0;
                    onChange({ ...config, downloadDelayMs: clamped });
                  }}
                  aria-label="Download delay in milliseconds"
                  className="w-20 px-2.5 py-1 text-xs font-mono tabular-nums text-slate-900 bg-transparent focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                />
                <span className="pr-2.5 text-[11px] font-mono text-slate-400 select-none">
                  ms
                </span>
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                disabled={disabled}
                checked={config.splitMultiUrls}
                onChange={(e) =>
                  onChange({ ...config, splitMultiUrls: e.target.checked })
                }
                className="w-3.5 h-3.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              Split multi-URL cells
            </label>

            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                disabled={disabled}
                checked={config.stripShopifyResizeParams}
                onChange={(e) =>
                  onChange({
                    ...config,
                    stripShopifyResizeParams: e.target.checked,
                  })
                }
                className="w-3.5 h-3.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              Fetch original Shopify resolution
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}

import express from "express";
import type { NextFunction, Request, Response } from "express";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import net from "net";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function isPrivateOrLocalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().trim();
  if (
    lower === "localhost" ||
    lower === "0.0.0.0" ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  ) {
    return true;
  }

  const ipVersion = net.isIP(lower);
  if (ipVersion === 4) {
    const parts = lower.split(".").map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  }

  if (ipVersion === 6) {
    const normalized = lower.replace(/^\[|\]$/g, "");
    if (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80")
    ) {
      return true;
    }
  }

  return false;
}

function detectExtensionFromMime(mime: string): string | null {
  const normalized = mime.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/pjpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
    "image/svg+xml": ".svg",
    "image/bmp": ".bmp",
    "image/x-ms-bmp": ".bmp",
    "image/tiff": ".tiff",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
  };
  return map[normalized] ?? null;
}

function detectExtensionFromBuffer(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ".jpg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return ".png";
  }
  // GIF: GIF87a / GIF89a
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return ".gif";
  // WEBP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return ".webp";
  }
  // AVIF / HEIC: ....ftypavif
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii").toLowerCase();
    if (brand === "avif" || brand === "avis") return ".avif";
  }
  // BMP: BM
  if (buf[0] === 0x42 && buf[1] === 0x4d) return ".bmp";
  // TIFF: II*\0 or MM\0*
  if (
    (buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
    (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a)
  ) {
    return ".tiff";
  }
  // SVG text check
  const head = buf.subarray(0, 256).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) {
    return ".svg";
  }
  return null;
}

type OutputFormat =
  | "original"
  | "jpg"
  | "png"
  | "webp"
  | "avif"
  | "tiff"
  | "gif";

type ResizeFit = "inside" | "contain" | "cover" | "fill";

interface ImageTransformOptions {
  outputFormat: OutputFormat;
  quality: number;
  resizeEnabled: boolean;
  width: number | null;
  height: number | null;
  fit: ResizeFit;
  background: string;
}

const VALID_OUTPUT_FORMATS = new Set<OutputFormat>([
  "original",
  "jpg",
  "png",
  "webp",
  "avif",
  "tiff",
  "gif",
]);

const VALID_RESIZE_FITS = new Set<ResizeFit>([
  "inside",
  "contain",
  "cover",
  "fill",
]);

const FORMAT_META: Record<
  Exclude<OutputFormat, "original">,
  { ext: string; mime: string }
> = {
  jpg: { ext: ".jpg", mime: "image/jpeg" },
  png: { ext: ".png", mime: "image/png" },
  webp: { ext: ".webp", mime: "image/webp" },
  avif: { ext: ".avif", mime: "image/avif" },
  tiff: { ext: ".tiff", mime: "image/tiff" },
  gif: { ext: ".gif", mime: "image/gif" },
};

function parsePositiveInt(val: unknown, max: number): number | null {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.max(1, Math.min(max, Math.round(num)));
}

function parseHexColor(val: unknown, fallback = "#ffffff"): string {
  if (typeof val !== "string") return fallback;
  const trimmed = val.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed) || /^#[0-9a-f]{3}$/i.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

function parseTransformOptions(raw: unknown): ImageTransformOptions {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawFormat = typeof obj.outputFormat === "string" ? obj.outputFormat : "original";
  const outputFormat: OutputFormat = VALID_OUTPUT_FORMATS.has(
    rawFormat as OutputFormat
  )
    ? (rawFormat as OutputFormat)
    : "original";

  const rawQuality = Number(obj.quality);
  const quality = Number.isFinite(rawQuality)
    ? Math.max(10, Math.min(100, Math.round(rawQuality)))
    : 90;

  const resizeEnabled =
    obj.resizeEnabled === true || obj.resizeEnabled === "true";
  const width = parsePositiveInt(obj.width, 10000);
  const height = parsePositiveInt(obj.height, 10000);

  const rawFit = typeof obj.fit === "string" ? obj.fit : "inside";
  const fit: ResizeFit = VALID_RESIZE_FITS.has(rawFit as ResizeFit)
    ? (rawFit as ResizeFit)
    : "inside";

  const background = parseHexColor(obj.background, "#ffffff");

  return {
    outputFormat,
    quality,
    resizeEnabled,
    width,
    height,
    fit,
    background,
  };
}

function resolveConcreteFormat(
  requested: OutputFormat,
  fallbackExt: string
): Exclude<OutputFormat, "original"> {
  if (requested !== "original") return requested;
  const normalized = fallbackExt.toLowerCase();
  if (normalized === ".jpg" || normalized === ".jpeg") return "jpg";
  if (normalized === ".png") return "png";
  if (normalized === ".webp") return "webp";
  if (normalized === ".avif") return "avif";
  if (normalized === ".tiff" || normalized === ".tif") return "tiff";
  if (normalized === ".gif") return "gif";
  return "png";
}

async function processImageBuffer(
  inputBuffer: Buffer,
  fallbackExt: string,
  fallbackMime: string,
  transform: ImageTransformOptions
): Promise<{
  buffer: Buffer;
  extension: string;
  contentType: string;
  width?: number;
  height?: number;
}> {
  const shouldResize =
    transform.resizeEnabled &&
    (transform.width !== null || transform.height !== null);
  const shouldConvert = transform.outputFormat !== "original";

  if (!shouldResize && !shouldConvert) {
    try {
      const meta = await sharp(inputBuffer, { failOn: "none" }).metadata();
      return {
        buffer: inputBuffer,
        extension: fallbackExt,
        contentType: fallbackMime,
        width: meta.width,
        height: meta.height,
      };
    } catch {
      return {
        buffer: inputBuffer,
        extension: fallbackExt,
        contentType: fallbackMime,
      };
    }
  }

  const targetFormat = resolveConcreteFormat(transform.outputFormat, fallbackExt);
  const targetMeta = FORMAT_META[targetFormat];

  let pipeline = sharp(inputBuffer, {
    failOn: "none",
    density: fallbackExt === ".svg" ? 300 : undefined,
  }).rotate();

  if (shouldResize) {
    if (transform.width !== null && transform.height !== null) {
      pipeline = pipeline.resize({
        width: transform.width,
        height: transform.height,
        fit: transform.fit,
        position: "centre",
        background: transform.background,
        withoutEnlargement: false,
      });
    } else {
      pipeline = pipeline.resize({
        width: transform.width ?? undefined,
        height: transform.height ?? undefined,
        fit: "inside",
        withoutEnlargement: false,
      });
    }
  }

  if (targetFormat === "jpg") {
    pipeline = pipeline
      .flatten({ background: transform.background })
      .jpeg({ quality: transform.quality, mozjpeg: true });
  } else if (targetFormat === "png") {
    pipeline = pipeline.png({ compressionLevel: 9 });
  } else if (targetFormat === "webp") {
    pipeline = pipeline.webp({ quality: transform.quality });
  } else if (targetFormat === "avif") {
    pipeline = pipeline.avif({ quality: transform.quality });
  } else if (targetFormat === "tiff") {
    pipeline = pipeline.tiff({
      quality: transform.quality,
      compression: "lzw",
    });
  } else if (targetFormat === "gif") {
    pipeline = pipeline.gif();
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    extension: targetMeta.ext,
    contentType: targetMeta.mime,
    width: info.width,
    height: info.height,
  };
}

function detectExtensionFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const pathname = parsed.pathname.toLowerCase();
    const match = pathname.match(/\.(jpg|jpeg|png|webp|gif|avif|svg|bmp|tiff?)$/);
    if (!match) return null;
    const ext = `.${match[1]}`;
    return ext === ".jpeg" ? ".jpg" : ext;
  } catch {
    return null;
  }
}

function maybeStripShopifyResizeParams(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const isShopifyHost =
      parsed.hostname.includes("shopify.com") ||
      parsed.pathname.includes("/cdn/shop/");

    if (!isShopifyHost) return rawUrl;

    // Remove width/height/crop resize query parameters while keeping cache-buster ?v= if present
    parsed.searchParams.delete("width");
    parsed.searchParams.delete("height");
    parsed.searchParams.delete("crop");
    parsed.searchParams.delete("pad_color");

    // Strip legacy Shopify _1024x1024 or _large suffix before extension if present
    parsed.pathname = parsed.pathname.replace(
      /_(\d+x\d*|pico|icon|thumb|small|compact|medium|large|grande|1024x1024|2048x2048|master)(?=\.(jpg|jpeg|png|webp|gif|avif))/i,
      ""
    );

    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post("/api/validate-image", async (req: Request, res: Response) => {
    const body = req.body as { url?: unknown; stripResizeParams?: unknown };
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
    const stripResizeParams = Boolean(body?.stripResizeParams);

    if (!rawUrl) {
      res.status(400).json({ valid: false, error: "Missing image URL." });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      res.status(400).json({ valid: false, error: "Invalid URL format." });
      return;
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      res.status(400).json({
        valid: false,
        error: "Only HTTP and HTTPS image URLs are supported.",
      });
      return;
    }

    if (isPrivateOrLocalHost(parsedUrl.hostname)) {
      res.status(403).json({
        valid: false,
        error: "Local or private network hosts are not permitted.",
      });
      return;
    }

    const targetUrl = stripResizeParams
      ? maybeStripShopifyResizeParams(parsedUrl.toString())
      : parsedUrl.toString();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const requestHeaders = {
        "User-Agent":
          "Mozilla/5.0 (compatible; StyleVaultAssetValidator/1.0; +https://cdn.shopify.com)",
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
      };

      let upstream = await fetch(targetUrl, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
        headers: requestHeaders,
      });

      // Fallback to lightweight Range GET if CDN rejects HEAD
      let magicExt: string | null = null;
      if (upstream.status === 405 || upstream.status === 501) {
        upstream = await fetch(targetUrl, {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: {
            ...requestHeaders,
            Range: "bytes=0-255",
          },
        });

        if (upstream.ok && upstream.body) {
          const reader = upstream.body.getReader();
          try {
            const { value } = await reader.read();
            if (value) {
              magicExt = detectExtensionFromBuffer(Buffer.from(value));
            }
          } finally {
            await reader.cancel().catch(() => {});
          }
        }
      }

      if (!upstream.ok) {
        const statusLabel = `HTTP ${upstream.status}${upstream.statusText ? ` ${upstream.statusText}` : ""}`.trim();
        res.status(200).json({
          valid: false,
          status: upstream.status,
          error: statusLabel,
        });
        return;
      }

      const contentType = (upstream.headers.get("content-type") || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      const rawLength = upstream.headers.get("content-length");
      const contentLength =
        rawLength && /^\d+$/.test(rawLength) ? Number(rawLength) : undefined;
      const extFromMime = detectExtensionFromMime(contentType);
      const extFromUrl = detectExtensionFromUrl(upstream.url || targetUrl);

      if (
        contentType &&
        !contentType.startsWith("image/") &&
        contentType !== "application/octet-stream" &&
        contentType !== "binary/octet-stream" &&
        !magicExt
      ) {
        res.status(200).json({
          valid: false,
          status: upstream.status,
          contentType,
          error: `Returned ${contentType} instead of an image`,
        });
        return;
      }

      if (contentLength === 0) {
        res.status(200).json({
          valid: false,
          status: upstream.status,
          error: "Empty file (0 bytes)",
        });
        return;
      }

      const detectedExtension = magicExt || extFromMime || extFromUrl || ".jpg";

      res.status(200).json({
        valid: true,
        status: upstream.status,
        contentType: contentType || "image/*",
        contentLength,
        detectedExtension,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.name === "AbortError"
            ? "Timed out after 15s"
            : err.message
          : "Network error";
      res.status(200).json({
        valid: false,
        error: message,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  });

  app.post("/api/fetch-image", async (req: Request, res: Response) => {
    const body = req.body as {
      url?: unknown;
      stripResizeParams?: unknown;
      transform?: unknown;
    };
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
    const stripResizeParams = Boolean(body?.stripResizeParams);
    const transform = parseTransformOptions(body?.transform);

    if (!rawUrl) {
      res.status(400).json({ error: "Missing image URL." });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      res.status(400).json({ error: "Invalid URL format." });
      return;
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      res.status(400).json({ error: "Only HTTP and HTTPS image URLs are supported." });
      return;
    }

    if (isPrivateOrLocalHost(parsedUrl.hostname)) {
      res.status(403).json({ error: "Local or private network hosts are not permitted." });
      return;
    }

    const targetUrl = stripResizeParams
      ? maybeStripShopifyResizeParams(parsedUrl.toString())
      : parsedUrl.toString();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const upstream = await fetch(targetUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; StyleVaultAssetFetcher/1.0; +https://cdn.shopify.com)",
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
        },
      });

      if (!upstream.ok) {
        res.status(502).json({
          error: `Upstream returned HTTP ${upstream.status} ${upstream.statusText}`.trim(),
        });
        return;
      }

      const arrayBuffer = await upstream.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0) {
        res.status(502).json({ error: "Upstream returned an empty file." });
        return;
      }

      // Guard against oversized non-image payloads (max 50MB)
      if (buffer.length > 50 * 1024 * 1024) {
        res.status(413).json({ error: "Image exceeds 50 MB size limit." });
        return;
      }

      const contentType = upstream.headers.get("content-type") || "";
      const extFromMagic = detectExtensionFromBuffer(buffer);
      const extFromMime = detectExtensionFromMime(contentType);
      const extFromUrl = detectExtensionFromUrl(upstream.url || targetUrl);

      if (
        !contentType.toLowerCase().startsWith("image/") &&
        !extFromMagic
      ) {
        res.status(422).json({
          error: `URL did not return a valid image (${contentType || "unknown content-type"}).`,
        });
        return;
      }

      const detectedExt = extFromMagic || extFromMime || extFromUrl || ".jpg";
      const responseMime =
        contentType.toLowerCase().startsWith("image/")
          ? contentType.split(";")[0].trim()
          : "application/octet-stream";

      const processed = await processImageBuffer(
        buffer,
        detectedExt,
        responseMime,
        transform
      );

      res.setHeader("Content-Type", processed.contentType);
      res.setHeader("Content-Length", String(processed.buffer.length));
      res.setHeader("X-Detected-Extension", processed.extension);
      res.setHeader("X-Content-Type", processed.contentType);
      if (processed.width && processed.height) {
        res.setHeader("X-Image-Width", String(processed.width));
        res.setHeader("X-Image-Height", String(processed.height));
      }
      res.setHeader("X-Resolved-Url", upstream.url || targetUrl);
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(processed.buffer);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.name === "AbortError"
            ? "Request timed out after 25 seconds."
            : err.message
          : "Failed to fetch image.";
      res.status(502).json({ error: message });
    } finally {
      clearTimeout(timeoutId);
    }
  });

  app.post(
    "/api/convert-image",
    express.raw({ type: "*/*", limit: "50mb" }),
    async (req: Request, res: Response) => {
      const inputBuffer = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.alloc(0);

      if (inputBuffer.length === 0) {
        res.status(400).json({ error: "Empty image payload." });
        return;
      }

      const transform = parseTransformOptions({
        outputFormat: req.query.format,
        quality: req.query.quality,
        resizeEnabled: req.query.resizeEnabled,
        width: req.query.width,
        height: req.query.height,
        fit: req.query.fit,
        background: req.query.background,
      });

      const contentType = req.headers["content-type"] || "";
      const extFromMagic = detectExtensionFromBuffer(inputBuffer);
      const extFromMime = detectExtensionFromMime(contentType);
      const fallbackExt = extFromMagic || extFromMime || ".png";
      const fallbackMime =
        contentType.toLowerCase().startsWith("image/")
          ? contentType.split(";")[0].trim()
          : "image/png";

      try {
        const processed = await processImageBuffer(
          inputBuffer,
          fallbackExt,
          fallbackMime,
          transform
        );

        res.setHeader("Content-Type", processed.contentType);
        res.setHeader("Content-Length", String(processed.buffer.length));
        res.setHeader("X-Detected-Extension", processed.extension);
        res.setHeader("X-Content-Type", processed.contentType);
        if (processed.width && processed.height) {
          res.setHeader("X-Image-Width", String(processed.width));
          res.setHeader("X-Image-Height", String(processed.height));
        }
        res.setHeader("Cache-Control", "no-store");
        res.status(200).send(processed.buffer);
      } catch (err: unknown) {
        res.status(422).json({
          error:
            err instanceof Error ? err.message : "Unable to convert image.",
        });
      }
    }
  );

  if (process.env.NODE_ENV !== "production") {
    const viteReady = import("vite").then(({ createServer: createViteServer }) =>
      createViteServer({
        server: {
          middlewareMode: true,
          hmr:
            process.env.DISABLE_HMR === "true"
              ? false
              : { server: httpServer },
        },
        appType: "spa",
      })
    );

    app.use((req: Request, res: Response, next: NextFunction) => {
      viteReady
        .then((vite) => vite.middlewares(req, res, next))
        .catch(next);
    });
  } else {
    const distDir = path.resolve(__dirname, "dist");
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get("*", (_req: Request, res: Response) => {
        res.sendFile(path.join(distDir, "index.html"));
      });
    }
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`StyleVault server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

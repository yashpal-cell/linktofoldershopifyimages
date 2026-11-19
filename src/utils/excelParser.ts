import * as XLSX from "xlsx";
import type { MappingConfig, SheetData, WorkbookData } from "../types/asset.ts";

function normalizeHeader(value: unknown, fallbackIndex: number): string {
  const text = String(value ?? "").trim();
  return text || `Column ${fallbackIndex + 1}`;
}

export async function parseSpreadsheetFile(file: File): Promise<WorkbookData> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const sheets: SheetData[] = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: false,
      defval: "",
    });

    // Find the first non-empty row to treat as column headers
    const headerRowIndex = matrix.findIndex(
      (row) =>
        Array.isArray(row) &&
        row.some((cell) => String(cell ?? "").trim().length > 0)
    );

    if (headerRowIndex === -1) {
      return { name: sheetName, headers: [], rows: [] };
    }

    const rawHeaderRow = matrix[headerRowIndex] as unknown[];
    const seenHeaders = new Map<string, number>();
    const headers = rawHeaderRow.map((cell, idx) => {
      const base = normalizeHeader(cell, idx);
      const count = seenHeaders.get(base) ?? 0;
      seenHeaders.set(base, count + 1);
      return count === 0 ? base : `${base} (${count + 1})`;
    });

    const rows: Record<string, string>[] = [];
    for (let i = headerRowIndex + 1; i < matrix.length; i++) {
      const rawRow = matrix[i];
      if (!Array.isArray(rawRow)) continue;

      const record: Record<string, string> = {};
      let hasAnyValue = false;

      headers.forEach((header, colIdx) => {
        const val = String(rawRow[colIdx] ?? "").trim();
        if (val.length > 0) hasAnyValue = true;
        record[header] = val;
      });

      if (hasAnyValue) {
        rows.push(record);
      }
    }

    return { name: sheetName, headers, rows };
  }).filter((s) => s.headers.length > 0);

  return {
    fileName: file.name,
    sheets,
  };
}

export function inferColumnMapping(
  sheet: SheetData,
  workbookFileName: string
): MappingConfig {
  const headers = sheet.headers;
  const sampleRows = sheet.rows.slice(0, 25);

  const scoreHeader = (header: string, keywords: string[]): number => {
    const lower = header.toLowerCase().replace(/[_-]+/g, " ").trim();
    let score = 0;
    for (const kw of keywords) {
      if (lower === kw) score += 10;
      else if (lower.includes(kw)) score += 5;
    }
    return score;
  };

  // Detect URL columns first by both cell contents & header keywords
  const urlColumns: string[] = [];
  for (const header of headers) {
    const urlCount = sampleRows.filter((r) =>
      /https?:\/\//i.test(r[header] || "")
    ).length;
    const headerScore = scoreHeader(header, [
      "shopify",
      "cdn",
      "image url",
      "image link",
      "img url",
      "src",
      "url",
      "link",
      "image",
      "photo",
    ]);

    if (urlCount > 0 || headerScore >= 5) {
      // Avoid misclassifying style/file name columns that don't actually have URLs
      if (urlCount > 0) {
        urlColumns.push(header);
      }
    }
  }

  // Fallback: if no cell had http(s):// in top 25 rows, rely on header score
  if (urlColumns.length === 0) {
    const sortedUrlCandidates = [...headers].sort(
      (a, b) =>
        scoreHeader(b, ["cdn", "url", "link", "src", "image", "photo"]) -
        scoreHeader(a, ["cdn", "url", "link", "src", "image", "photo"])
    );
    if (sortedUrlCandidates[0]) {
      urlColumns.push(sortedUrlCandidates[0]);
    }
  }

  const nonUrlHeaders = headers.filter((h) => !urlColumns.includes(h));

  // Detect Style / Folder column
  const styleKeywords = [
    "style",
    "style code",
    "style no",
    "style name",
    "folder",
    "folder name",
    "sku",
    "handle",
    "product",
    "category",
    "group",
  ];
  let bestStyleCol = "";
  let bestStyleScore = 0;
  for (const h of nonUrlHeaders) {
    const s = scoreHeader(h, styleKeywords);
    if (s > bestStyleScore) {
      bestStyleScore = s;
      bestStyleCol = h;
    }
  }
  if (!bestStyleCol && nonUrlHeaders.length > 0) {
    bestStyleCol = nonUrlHeaders[0];
  }

  // Detect File Name column
  const fileKeywords = [
    "file name",
    "filename",
    "image name",
    "imagename",
    "img name",
    "name",
    "title",
    "alt",
    "shot",
    "angle",
    "variant",
  ];
  let bestFileCol = "";
  let bestFileScore = 0;
  for (const h of nonUrlHeaders) {
    if (h === bestStyleCol) continue;
    const s = scoreHeader(h, fileKeywords);
    if (s > bestFileScore) {
      bestFileScore = s;
      bestFileCol = h;
    }
  }

  const baseWorkbookName = workbookFileName.replace(/\.(xlsx|xls|csv)$/i, "");

  return {
    styleColumn: bestStyleCol,
    fileNameColumn: bestFileCol,
    urlColumns,
    rootFolderName: baseWorkbookName,
    splitMultiUrls: true,
    stripShopifyResizeParams: false,
    duplicatePolicy: "number",
    defaultFolderName: "Unsorted",
    concurrency: 5,
    downloadDelayMs: 0,
    outputFormat: "original",
    outputQuality: 90,
    resizeEnabled: false,
    targetWidth: null,
    targetHeight: null,
    resizeFit: "inside",
    backgroundColor: "#ffffff",
  };
}

export function downloadSampleExcelTemplate(): void {
  const sampleRows = [
    {
      Style: "ST-1042-BLK",
      "File Name": "ST-1042-BLK_front",
      "Shopify CDN Link": "https://cdn.shopify.com/s/files/1/0000/0000/files/example-front.jpg",
    },
    {
      Style: "ST-1042-BLK",
      "File Name": "ST-1042-BLK_back",
      "Shopify CDN Link": "https://cdn.shopify.com/s/files/1/0000/0000/files/example-back.jpg",
    },
    {
      Style: "ST-2088-NVY",
      "File Name": "ST-2088-NVY_hero",
      "Shopify CDN Link": "https://cdn.shopify.com/s/files/1/0000/0000/files/example-hero.png",
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  worksheet["!cols"] = [{ wch: 18 }, { wch: 26 }, { wch: 68 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Shopify_Images");
  XLSX.writeFile(workbook, "shopify_style_images_template.xlsx");
}

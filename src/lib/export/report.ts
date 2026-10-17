/**
 * Report model shared by CSV, XLSX and print exports.
 * Every export carries the brand, assumptions, conventions, provenance, a generated timestamp,
 * and the disclaimer.
 */
import { sanitiseCell, type CellValue } from './sanitize';

export const BRAND = 'Lakshya';
export const ATTRIBUTION = 'Created by Alok Shukla';
export const DISCLAIMER =
  'Educational estimate only. Not investment, tax or legal advice. Past performance does not indicate future results. ' +
  'Projections depend entirely on the stated assumptions. Lakshya is not a SEBI-registered investment adviser or research analyst.';

export interface ReportTable {
  name: string;
  columns: Array<{ header: string; numFmt?: string }>;
  rows: CellValue[][];
}

export interface Report {
  title: string;
  generatedAt: string;
  assumptions: Array<[label: string, value: CellValue]>;
  /** e.g. contribution timing, rate convention, NAV allocation rule. */
  conventions: Array<[label: string, value: string]>;
  provenance?: Array<[label: string, value: string]>;
  summary: Array<[label: string, value: CellValue]>;
  tables: ReportTable[];
  methodology: string;
}

function csvEscape(v: CellValue): string {
  const s = sanitiseCell(v);
  if (s === null) return '';
  const text = s instanceof Date ? s.toISOString() : String(s);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV with a metadata preamble, then each table. Uses CRLF line endings and a UTF-8 BOM for spreadsheet compatibility. */
export function reportToCsv(report: Report): string {
  const lines: string[] = [];
  const kv = (k: string, v: CellValue) => lines.push(`${csvEscape(k)},${csvEscape(v)}`);
  kv(BRAND, report.title);
  kv('Attribution', ATTRIBUTION);
  kv('Generated', report.generatedAt);
  lines.push('');
  lines.push('Assumptions');
  report.assumptions.forEach(([k, v]) => kv(k, v));
  report.conventions.forEach(([k, v]) => kv(k, v));
  if (report.provenance?.length) {
    lines.push('');
    lines.push('Data source');
    report.provenance.forEach(([k, v]) => kv(k, v));
  }
  lines.push('');
  lines.push('Summary');
  report.summary.forEach(([k, v]) => kv(k, v));
  for (const t of report.tables) {
    lines.push('');
    lines.push(csvEscape(t.name));
    lines.push(t.columns.map((c) => csvEscape(c.header)).join(','));
    t.rows.forEach((r) => lines.push(r.map(csvEscape).join(',')));
  }
  lines.push('');
  kv('Methodology', report.methodology);
  kv('Disclaimer', DISCLAIMER);
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/**
 * Builds an XLSX workbook (ExcelJS, loaded lazily) with plain numeric values, not formulas, so it
 * renders correctly in viewers that do not recalculate.
 */
export async function reportToXlsx(report: Report): Promise<Uint8Array> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = `${BRAND} — ${ATTRIBUTION}`;
  wb.created = new Date(report.generatedAt);

  const info = wb.addWorksheet('Summary');
  info.columns = [{ width: 38 }, { width: 60 }];
  const add = (k: string, v: CellValue) => info.addRow([sanitiseCell(k), sanitiseCell(v)]);
  info.addRow([BRAND, sanitiseCell(report.title)]).font = { bold: true, size: 14 };
  add('Attribution', ATTRIBUTION);
  add('Generated', report.generatedAt);
  info.addRow([]);
  info.addRow(['Assumptions']).font = { bold: true };
  report.assumptions.forEach(([k, v]) => add(k, v));
  report.conventions.forEach(([k, v]) => add(k, v));
  if (report.provenance?.length) {
    info.addRow([]);
    info.addRow(['Data source']).font = { bold: true };
    report.provenance.forEach(([k, v]) => add(k, v));
  }
  info.addRow([]);
  info.addRow(['Summary']).font = { bold: true };
  report.summary.forEach(([k, v]) => add(k, v));
  info.addRow([]);
  add('Methodology', report.methodology);
  add('Disclaimer', DISCLAIMER);

  for (const t of report.tables) {
    const ws = wb.addWorksheet(t.name.replace(/[\\/?*[\]:]/g, '-').slice(0, 31));
    ws.columns = t.columns.map((c) => ({ header: sanitiseCell(c.header) as string, width: Math.max(12, c.header.length + 2) }));
    ws.getRow(1).font = { bold: true };
    t.rows.forEach((r) => ws.addRow(r.map(sanitiseCell)));
    t.columns.forEach((c, i) => {
      if (c.numFmt) ws.getColumn(i + 1).numFmt = c.numFmt;
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

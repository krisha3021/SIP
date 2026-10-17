import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { formatINR, formatINRCompact, formatIndianNumber, formatPct } from '@/lib/format/inr';
import { neutraliseText, sanitiseCell } from '@/lib/export/sanitize';
import { DISCLAIMER, reportToCsv, reportToXlsx, type Report } from '@/lib/export/report';

describe('INR formatting', () => {
  it('uses Indian digit grouping', () => {
    expect(formatINR(1234567.891)).toBe('₹12,34,567.89');
    expect(formatIndianNumber(123456789)).toBe('12,34,56,789');
    expect(formatIndianNumber(999)).toBe('999');
    expect(formatIndianNumber(1000)).toBe('1,000');
    expect(formatINR(100)).toBe('₹100.00');
  });
  it('compacts to lakh and crore without a K suffix', () => {
    expect(formatINRCompact(45_200_000)).toBe('₹4.52 Cr');
    expect(formatINRCompact(1_250_000)).toBe('₹12.5 L');
    expect(formatINRCompact(85_000)).toBe('₹85,000');
    expect(formatINRCompact(-2_000_000)).toBe('−₹20 L');
  });
  it('renders non-finite values as an explicit dash', () => {
    expect(formatINR(Number.NaN)).toBe('—');
    expect(formatINRCompact(Infinity)).toBe('—');
    expect(formatPct(undefined)).toBe('—');
  });
  it('formats negatives and negative zero sensibly', () => {
    expect(formatINR(-1500.5)).toBe('−₹1,500.50');
    expect(formatINR(-0.001)).toBe('₹0.00');
    expect(formatPct(-3.14159, 2)).toBe('−3.14%');
  });
});

describe('formula-injection protection', () => {
  it.each(['=HYPERLINK("http://x","y")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd', '\rcmd'])('neutralises %j', (s) => {
    expect(neutraliseText(s)).toBe(`'${s}`);
  });
  it('leaves safe text and numbers alone', () => {
    expect(neutraliseText('My retirement plan')).toBe('My retirement plan');
    expect(sanitiseCell(-1234.5)).toBe(-1234.5);
    expect(sanitiseCell(Number.NaN)).toBeNull();
  });
});

const report: Report = {
  title: 'SIP projection',
  generatedAt: '2026-10-17T10:00:00.000Z',
  assumptions: [
    ['Plan name', '=cmd|" /C calc"!A0'],
    ['Monthly SIP (₹)', 10_000],
  ],
  conventions: [
    ['Contribution timing', 'End of month'],
    ['Return convention', 'Effective annual, converted to monthly'],
  ],
  provenance: [['Provider', 'MFAPI.in']],
  summary: [['Final value (₹)', 2_300_386.89]],
  tables: [{ name: 'Yearly', columns: [{ header: 'Year' }, { header: 'Value (₹)', numFmt: '#,##0.00' }], rows: [[1, 126_825.03], [2, '-=evil']] }],
  methodology: 'Monthly compounding; see Methodology page.',
};

describe('CSV export', () => {
  const csv = reportToCsv(report);
  it('includes brand, timestamp, conventions, provenance and disclaimer', () => {
    expect(csv.startsWith('﻿Lakshya,SIP projection')).toBe(true);
    expect(csv).toContain('Generated,2026-10-17T10:00:00.000Z');
    expect(csv).toContain('Contribution timing,End of month');
    expect(csv).toContain('Provider,MFAPI.in');
    expect(csv).toContain(DISCLAIMER.slice(0, 40));
    expect(csv).toContain('Created by Alok Shukla');
  });
  it('neutralises and quotes dangerous user text', () => {
    expect(csv).toContain(`Plan name,"'=cmd|"" /C calc""!A0"`);
    expect(csv).toContain(`2,'-=evil`);
  });
  it('keeps numbers numeric', () => {
    expect(csv).toContain('Monthly SIP (₹),10000');
  });
});

describe('XLSX export', () => {
  it('writes evaluated numeric values (no formulas) and neutralised text', async () => {
    const bytes = await reportToXlsx(report);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const summary = wb.getWorksheet('Summary')!;
    const values = summary.getSheetValues().flat().filter((x) => x !== undefined && x !== null);
    expect(values).toContain(`'=cmd|" /C calc"!A0`);
    expect(values).toContain(2_300_386.89);
    const yearly = wb.getWorksheet('Yearly')!;
    expect(yearly.getCell('B2').value).toBe(126_825.03);
    expect(yearly.getCell('B3').value).toBe(`'-=evil`);
    let formulaCount = 0;
    wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => { if (c.type === ExcelJS.ValueType.Formula) formulaCount++; })));
    expect(formulaCount).toBe(0);
  });
});

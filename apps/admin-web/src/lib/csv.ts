/**
 * Client-side CSV download.
 *
 * Extracted from LedgerPage, which hand-rolled this inline. Every cell is quoted and
 * embedded quotes doubled -- the original only escaped the description column, so a
 * comma in any other field would have shifted the row.
 */
export function csvDownload(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
) {
  const escape = (cell: string | number | null | undefined) =>
    `"${String(cell ?? '').replaceAll('"', '""')}"`;

  const body = [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join(
    '\n',
  );

  // A BOM so Excel opens UTF-8 names (Mwakasege, Kimaro) correctly rather than as
  // mojibake.
  const blob = new Blob([`﻿${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

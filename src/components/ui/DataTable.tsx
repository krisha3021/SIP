export interface Column<R> {
  header: string;
  /** Right-align numbers. */
  numeric?: boolean;
  cell: (row: R) => React.ReactNode;
}

/**
 * Accessible data table in a keyboard-scrollable region. `maxRows` limits rendering of very long
 * schedules; the full data is always available in the CSV/XLSX download.
 */
export function DataTable<R>({
  caption,
  columns,
  rows,
  rowKey,
  maxHeight = '28rem',
}: {
  caption: string;
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R, i: number) => string | number;
  maxHeight?: string;
}) {
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="overflow-auto rounded-lg border border-line"
      style={{ maxHeight }}
    >
      <table className="num w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface-2">
          <tr>
            {columns.map((c) => (
              <th key={c.header} scope="col" className={`whitespace-nowrap border-b border-line px-3 py-2 font-semibold ${c.numeric ? 'text-right' : 'text-left'}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)} className="odd:bg-surface even:bg-bg">
              {columns.map((c, j) => {
                const content = c.cell(r);
                return j === 0 ? (
                  <th key={c.header} scope="row" className={`whitespace-nowrap border-b border-line px-3 py-1.5 font-medium ${c.numeric ? 'text-right' : 'text-left'}`}>
                    {content}
                  </th>
                ) : (
                  <td key={c.header} className={`whitespace-nowrap border-b border-line px-3 py-1.5 ${c.numeric ? 'text-right' : 'text-left'}`}>
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

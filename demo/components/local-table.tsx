'use client';

import { DataTable } from './data-table';
import { useDemo } from './demo-state';

/** The table from React state: defaults in the server HTML, the stored values after hydration. */
export function LocalTable() {
  const { values } = useDemo();
  return <DataTable pageSize={values.pageSize} locale={values.locale} />;
}

import { deployments, type Status } from '../lib/data';
import { formatters, rowCount } from '../lib/format';
import { LOCALE_TAGS, type Locale } from '../lib/options';

const STATUS_LABELS: Record<Status, string> = {
  ready: 'Ready',
  error: 'Error',
  building: 'Building',
  canceled: 'Canceled',
};

/**
 * The deployments table. No hooks and no browser APIs: the cookie page renders it in a
 * Server Component, the localStorage page in a Client Component.
 */
export function DataTable({ pageSize, locale }: { pageSize: number; locale: Locale }) {
  const f = formatters(locale);
  const rows = deployments.slice(0, rowCount(pageSize, deployments.length));
  return (
    <div className="table-card" data-testid="table" data-rows={rows.length} data-locale={locale} lang={LOCALE_TAGS[locale]}>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Deployment</th>
              <th scope="col" className="col-status">Status</th>
              <th scope="col" className="col-branch">Branch</th>
              <th scope="col" className="num col-duration">Build</th>
              <th scope="col" className="num col-requests">Requests</th>
              <th scope="col" className="num">Cost</th>
              <th scope="col" className="col-created">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} data-testid="table-row">
                <td>
                  <span className="cell-project">
                    <span className="project-name">{d.project}</span>
                    <span className={`env env-${d.environment}`}>{d.environment == 'production' ? 'Prod' : 'Preview'}</span>
                  </span>
                </td>
                <td className="col-status">
                  <span className={`status status-${d.status}`}>
                    <span className="status-dot" aria-hidden="true" />
                    {STATUS_LABELS[d.status]}
                  </span>
                </td>
                <td className="col-branch">
                  <span className="mono branch">{d.branch}</span>
                </td>
                <td className="num col-duration" data-testid="cell-duration">{f.seconds.format(d.duration)}</td>
                <td className="num col-requests" data-testid="cell-requests">{f.compact.format(d.requests)}</td>
                <td className="num" data-testid="cell-cost">{f.currency.format(d.cost)}</td>
                <td className="col-created muted" data-testid="cell-created">
                  <time dateTime={new Date(d.createdAt).toISOString()}>{f.date.format(d.createdAt)}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span data-testid="table-summary">
          {f.integer.format(1)}–{f.integer.format(rows.length)} / {f.integer.format(deployments.length)}
        </span>
        <span className="muted">{LOCALE_TAGS[locale]}</span>
      </div>
    </div>
  );
}

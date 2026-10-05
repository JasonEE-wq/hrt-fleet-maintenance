import type { ReactNode } from 'react';
import {
  Search,
  ArrowUpRight,
  Inbox,
  CheckCircle2,
  Clock3,
  AlertCircle,
} from 'lucide-react';
import { useFleet } from '@/lib/context';
import type { TranslationKey } from '@/lib/i18n';
import { Button } from '@/components/ui/button';

export const Badge = ({ status }: { status: string }) => {
  const { t } = useFleet();
  const key = status === 'maintenance' ? 'maintenanceStatus' : status;
  return (
    <span className={`badge badge-${status}`}>
      <span className="badge-dot" />
      {t(key as TranslationKey)}
    </span>
  );
};

export const SectionHeader = ({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) => {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {action}
    </div>
  );
};

export const Toolbar = ({
  query,
  setQuery,
  filter,
  setFilter,
  statuses,
  children,
}: {
  query: string;
  setQuery: (v: string) => void;
  filter: string;
  setFilter: (v: string) => void;
  statuses: string[];
  children?: ReactNode;
}) => {
  const { t } = useFleet();
  return (
    <div className="toolbar">
      <div className="search-field">
        <Search size={17} />
        <input
          aria-label={t('searchShort')}
          placeholder={t('searchShort')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="toolbar-right">
        <select
          aria-label={t('filter')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">{t('all')}</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {t(
                (s === 'maintenance'
                  ? 'maintenanceStatus'
                  : s) as TranslationKey,
              )}
            </option>
          ))}
        </select>
        {children}
      </div>
    </div>
  );
};

export const Empty = ({ clear }: { clear?: () => void }) => {
  const { t } = useFleet();
  return (
    <div className="empty">
      <Inbox size={36} strokeWidth={1.2} />
      <h3>{t('noResults')}</h3>
      <p>{t('noResultsHint')}</p>
      {clear && (
        <Button variant="outline" onClick={clear}>
          {t('clearFilters')}
        </Button>
      )}
    </div>
  );
};

export const LinkButton = ({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) => {
  return (
    <button className="link-button" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
};

export const Field = ({
  label,
  children,
  span = false,
}: {
  label: string;
  children: ReactNode;
  span?: boolean;
}) => {
  return (
    <label className={`field ${span ? 'field-full' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
};

export const Info = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => {
  return (
    <div className="info">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
};

export const Timeline = ({
  entityId,
  vehicleId,
}: {
  entityId?: string;
  vehicleId?: string;
}) => {
  const { state, t, tx, lang } = useFleet();
  const events = state.audit.filter((e) =>
    entityId ? e.entityId === entityId : e.vehicleId === vehicleId,
  );
  return (
    <div className="timeline">
      {!events.length ? (
        <p className="muted">{t('noActivity')}</p>
      ) : (
        events.slice(0, 12).map((e) => (
          <div className="timeline-item" key={e.id}>
            <span className="timeline-marker">
              <CheckCircle2 size={15} />
            </span>
            <div>
              <p>{tx(e.message)}</p>
              <small>
                {e.actor} ·{' '}
                {new Date(e.at).toLocaleString(
                  lang === 'zh' ? 'zh-CN' : 'en-AU',
                  {
                    timeZone: 'Australia/Sydney',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  },
                )}
              </small>
              <span className="timeline-id">{e.entityId}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export const RoleNote = ({ allowed }: { allowed: string[] }) => {
  const { role, t } = useFleet();
  if (allowed.includes(role)) return null;
  return (
    <div className="notice">
      <AlertCircle size={17} />
      <span>
        {t('roleLocked')}{' '}
        <strong>
          {allowed.map((r) => t(r as TranslationKey)).join(' / ')}
        </strong>
      </span>
    </div>
  );
};

export const SmallStat = ({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}) => {
  return (
    <div className="small-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {icon || <Clock3 size={16} />}
    </div>
  );
};

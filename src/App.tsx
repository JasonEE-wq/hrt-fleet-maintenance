import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  ClipboardCheck,
  TriangleAlert,
  Wrench,
  BusFront,
  CalendarClock,
  Package,
  Plus,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Languages,
  RotateCcw,
  Menu,
  X,
  Download,
  CheckCircle2,
  Leaf,
  ShieldCheck,
  CircleHelp,
} from 'lucide-react'
import { createSeed } from './lib/seed'
import { FleetError, transition, inspectionStatus, planStatus, totalCost } from './lib/fleet'
import {
  DEMO_DATE,
  users,
  roles,
  depots,
  vehicleClasses,
  type FleetState,
  type Language,
  type Role,
  type Page,
  type Vehicle,
  type Text,
} from './lib/model'
import { translate, type TranslationKey } from './lib/i18n'
import { FleetContext } from './lib/context'
import { Button } from './components/ui/button'
import { Badge, SectionHeader, Toolbar, Empty, LinkButton, Timeline } from './components/common'
import { Modal, type ModalState } from './components/Modal'

const STORAGE = 'hrt-fleet-demo-v2'

function readState(): FleetState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null')
    if (saved?.version === 2) return saved
  } catch {}
  return createSeed()
}

const navItems: { key: Page; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', icon: LayoutDashboard },
  { key: 'inspections', icon: ClipboardCheck },
  { key: 'defects', icon: TriangleAlert },
  { key: 'orders', icon: Wrench },
  { key: 'vehicles', icon: BusFront },
  { key: 'maintenance', icon: CalendarClock },
  { key: 'parts', icon: Package },
]

export default function App() {
  const [state, setState] = useState(readState)
  const [lang, setLang] = useState<Language>(() =>
    localStorage.getItem('hrt-language') === 'zh' ? 'zh' : 'en',
  )
  const [role, setRole] = useState<Role>('manager')
  const [page, setPage] = useState<Page>('dashboard')
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [depot, setDepot] = useState('all'),
    [vehicleClass, setVehicleClass] = useState('all')
  const [modal, setModal] = useState<ModalState>(null),
    [mobileNav, setMobileNav] = useState(false)
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null),
    [storageError, setStorageError] = useState(false)

  const t = (key: TranslationKey) => translate(lang, key),
    tx = (value: Text) => value[lang]

  const money = (n: number) =>
    new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en-AU', {
      style: 'currency',
      currency: 'AUD',
      currencyDisplay: 'code',
      maximumFractionDigits: 2,
    }).format(n)

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    document.title = lang === 'zh' ? 'HRT · 车辆维护工作台' : 'HRT · Fleet Workspace'
    localStorage.setItem('hrt-language', lang)
  }, [lang])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(state))
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [state])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(timer)
  }, [toast])

  function run(action: Parameters<typeof transition>[1]) {
    try {
      const updated = transition(state, action, role)
      setState(updated)
      setToast({ text: tx(updated.audit[0].message), error: false })
      return true
    } catch (e) {
      setToast({ text: e instanceof FleetError ? e[lang] : t('error'), error: true })
      return false
    }
  }

  function navigate(next: Page, nextFilter = 'all') {
    setPage(next)
    setQuery('')
    setFilter(nextFilter)
    setMobileNav(false)
  }

  const lookupVehicle = (id: string) => state.vehicles.find((v) => v.id === id)!

  const matches = (...values: (string | number)[]) =>
    values.join(' ').toLowerCase().includes(query.trim().toLowerCase())

  const inScope = (id: string) => {
    const v = lookupVehicle(id)
    return (
      (depot === 'all' || v.depot === depot) &&
      (vehicleClass === 'all' || v.vehicleClass === vehicleClass)
    )
  }

  const permitted = (allowed: Role[]) => allowed.includes(role)
  const isContractor = role === 'contractor'

  // 只统计在册车辆
  const fleet = state.vehicles.filter((v) => v.active && inScope(v.id))

  const count = (status: Vehicle['status']) => fleet.filter((v) => v.status === status).length
  const availability = fleet.length ? Math.round((count('available') / fleet.length) * 100) : 0
  const portalOrders = isContractor
    ? state.orders.filter((o) => o.assignee === users.contractor)
    : state.orders
  const queue = [
    {
      key: 'overdueInspections',
      value: state.inspections.filter(
        (i) => inScope(i.vehicleId) && inspectionStatus(i) === 'overdue',
      ).length,
      page: 'inspections',
      filter: 'overdue',
      icon: ClipboardCheck,
      color: 'amber',
    },
    {
      key: 'pendingReviews',
      value: state.orders.filter((o) => inScope(o.vehicleId) && o.status === 'review').length,
      page: 'orders',
      filter: 'review',
      icon: Wrench,
      color: 'blue',
    },
    {
      key: 'releaseQueue',
      value: count('awaitingRelease'),
      page: 'vehicles',
      filter: 'awaitingRelease',
      icon: ShieldCheck,
      color: 'green',
    },
    {
      key: 'serviceDue',
      value: state.plans.filter((p) => inScope(p.vehicleId) && planStatus(p, state) !== 'scheduled')
        .length,
      page: 'maintenance',
      filter: 'all',
      icon: CalendarClock,
      color: 'purple',
    },
  ] as const
  const vehicles = state.vehicles.filter(
    (v) =>
      matches(v.id, v.plate, v.model, v.depot, t(v.vehicleClass)) &&
      inScope(v.id) &&
      (filter === 'all' || (filter === 'inactive' ? !v.active : v.active && v.status === filter)),
  )
  const inspections = state.inspections.filter(
    (i) =>
      matches(i.id, i.vehicleId, t(i.type), i.assignee) &&
      inScope(i.vehicleId) &&
      (filter === 'all' || inspectionStatus(i) === filter),
  )
  const defects = state.defects.filter(
    (d) =>
      matches(d.id, d.vehicleId, tx(d.description)) &&
      inScope(d.vehicleId) &&
      (filter === 'all' || d.status === filter || d.severity === filter),
  )
  const orders = portalOrders.filter(
    (o) =>
      matches(o.id, o.vehicleId, tx(o.title), o.assignee) &&
      inScope(o.vehicleId) &&
      (filter === 'all' || o.status === filter),
  )
  const plans = state.plans.filter(
    (p) =>
      matches(p.id, p.vehicleId, tx(p.title)) &&
      inScope(p.vehicleId) &&
      (filter === 'all' || planStatus(p, state) === filter),
  )
  const parts = state.parts.filter(
    (p) =>
      matches(p.id, tx(p.name), p.sku, tx(p.category)) &&
      (filter === 'all' || (p.stock <= p.minStock ? 'lowStock' : 'healthyStock') === filter),
  )
  const visibleRecords =
    page === 'vehicles'
      ? vehicles
      : page === 'inspections'
        ? inspections
        : page === 'defects'
          ? defects
          : page === 'orders'
            ? orders
            : page === 'maintenance'
              ? plans
              : parts

  // 导出 CSV，= + - @ 开头的前面加单引号，免得 Excel 当成公式
  function exportCsv() {
    const csvCell = (v: unknown) => {
      const s = String(v ?? '')
      return '"' + (/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"'
    }
    let headers: string[] = [],
      rows: unknown[][] = []
    if (page === 'inspections') {
      headers = [t('recordId'), t('vehicle'), t('date'), t('type'), t('assignee'), t('status')]
      rows = inspections.map((i) => [
        i.id,
        i.vehicleId,
        i.date,
        t(i.type),
        i.assignee,
        t(inspectionStatus(i)),
      ])
    } else if (page === 'defects') {
      headers = [
        t('recordId'),
        t('vehicle'),
        t('description'),
        t('severity'),
        t('status'),
        t('linkedOrder'),
      ]
      rows = defects.map((d) => [
        d.id,
        d.vehicleId,
        tx(d.description),
        t(d.severity),
        t(d.status),
        d.orderId,
      ])
    } else if (page === 'orders') {
      headers = [
        t('recordId'),
        t('vehicle'),
        t('repairTask'),
        t('assignee'),
        t('status'),
        t('total'),
        t('financeTitle'),
        t('financeRef'),
      ]
      rows = orders.map((o) => [
        o.id,
        o.vehicleId,
        tx(o.title),
        o.assignee,
        t(o.status),
        totalCost(o),
        o.finance ? t(o.finance) : '',
        o.financeRef,
      ])
    } else if (page === 'vehicles') {
      headers = [
        t('vehicle'),
        t('plate'),
        t('model'),
        t('vehicleClass'),
        t('depot'),
        t('mileage'),
        t('status'),
      ]
      rows = vehicles.map((v) => [
        v.id,
        v.plate,
        v.model,
        t(v.vehicleClass),
        v.depot,
        v.mileage,
        t(!v.active ? 'inactive' : v.status === 'maintenance' ? 'maintenanceStatus' : v.status),
      ])
    } else if (page === 'maintenance') {
      headers = [
        t('recordId'),
        t('vehicle'),
        t('service'),
        t('dueDate'),
        t('dueMileage'),
        t('dueHours'),
        t('status'),
      ]
      rows = plans.map((p) => [
        p.id,
        p.vehicleId,
        tx(p.title),
        p.dueDate,
        p.dueMileage,
        p.dueHours,
        t(planStatus(p, state)),
      ])
    } else {
      headers = [t('sku'), t('part'), t('category'), t('stock'), t('unitPrice')]
      rows = parts.map((p) => [p.sku, tx(p.name), tx(p.category), p.stock, p.price])
    }
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')], {
        type: 'text/csv;charset=utf-8;',
      }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = `HRT-${page}-${DEMO_DATE}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // 首页和车辆页共用
  function vehicleTable(list: Vehicle[]) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('vehicle')}</th>
              <th>{t('depot')}</th>
              <th>{t('mileage')}</th>
              <th>{t('status')}</th>
              <th aria-label={t('action')} />
            </tr>
          </thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.id}>
                <td>
                  <div className="vehicle-cell">
                    <span className="vehicle-icon">
                      <BusFront size={19} />
                    </span>
                    <div>
                      <strong>{v.id}</strong>
                      <small>
                        {v.plate} · {v.model} · {t(v.vehicleClass)}
                      </small>
                    </div>
                  </div>
                </td>
                <td>{v.depot}</td>
                <td className="numeric">
                  {v.mileage.toLocaleString()}
                  <small className="inline-unit">km</small>
                </td>
                <td>
                  <Badge status={v.active ? v.status : 'inactive'} />
                </td>
                <td>
                  <button
                    className="row-action"
                    aria-label={`${t('viewDetails')} ${v.id}`}
                    onClick={() => setModal({ type: 'vehicle', id: v.id })}
                  >
                    <ArrowUpRight size={19} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && (
          <Empty
            clear={() => {
              setQuery('')
              setFilter('all')
              setDepot('all')
              setVehicleClass('all')
            }}
          />
        )}
      </div>
    )
  }

  const scopeSelects = (
    <>
      <select aria-label={t('depot')} value={depot} onChange={(e) => setDepot(e.target.value)}>
        <option value="all">{t('allDepots')}</option>
        {depots.map((d) => (
          <option key={d}>{d}</option>
        ))}
      </select>
      <select
        aria-label={t('vehicleClass')}
        value={vehicleClass}
        onChange={(e) => setVehicleClass(e.target.value)}
      >
        <option value="all">{t('allClasses')}</option>
        {vehicleClasses.map((c) => (
          <option key={c} value={c}>
            {t(c)}
          </option>
        ))}
      </select>
    </>
  )

  const navLabel = (key: Page) => (isContractor && key === 'orders' ? t('portalTitle') : t(key))
  return (
    <FleetContext.Provider value={{ state, lang, role, t, tx, money, run }}>
      <div className="app-shell">
        {mobileNav && (
          <button
            className="mobile-overlay"
            aria-label={t('collapse')}
            onClick={() => setMobileNav(false)}
          />
        )}
        <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault()
              navigate('dashboard')
            }}
          >
            <span className="brand-mark">
              <BusFront size={25} strokeWidth={1.7} />
            </span>
            <div>
              <strong>
                HRT<span>fleet.</span>
              </strong>
              <small>{t('workspace')}</small>
            </div>
          </a>
          <button
            className="mobile-close"
            aria-label={t('collapse')}
            onClick={() => setMobileNav(false)}
          >
            <X size={20} />
          </button>
          <nav>
            <p className="nav-label">{t('operation')}</p>
            {navItems
              .slice(0, 5)
              .filter(({ key }) => !isContractor || key === 'orders')
              .map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  className={`nav-item ${page === key ? 'active' : ''}`}
                  onClick={() => navigate(key)}
                >
                  <Icon size={19} />
                  <span>{navLabel(key)}</span>
                  {key === 'orders' && portalOrders.some((o) => o.status === 'review') && (
                    <span className="nav-count">
                      {portalOrders.filter((o) => o.status === 'review').length}
                    </span>
                  )}
                </button>
              ))}
            {!isContractor && <p className="nav-label resource-label">{t('resources')}</p>}
            {navItems
              .slice(5)
              .filter(() => !isContractor)
              .map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  className={`nav-item ${page === key ? 'active' : ''}`}
                  onClick={() => navigate(key)}
                >
                  <Icon size={19} />
                  <span>{t(key)}</span>
                  {key === 'parts' && (
                    <span className="nav-count muted-count">
                      {state.parts.filter((p) => p.stock <= p.minStock).length}
                    </span>
                  )}
                </button>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="demo-card">
              <span className="demo-card-icon">
                <Leaf size={20} />
              </span>
              <strong>{t('demo')}</strong>
              <p>{t('demoHint')}</p>
              <button onClick={() => setModal({ type: 'guide' })}>
                {t('flowTitle')}
                <ArrowRight size={15} />
              </button>
            </div>
            <button className="reset-link" onClick={() => setModal({ type: 'reset' })}>
              <RotateCcw size={15} />
              {t('reset')}
            </button>
            <div className="sidebar-user">
              <span className="avatar">
                {users[role]
                  .split(' ')
                  .map((s) => s[0])
                  .join('')}
              </span>
              <div>
                <strong>{users[role]}</strong>
                <small>{t(role)}</small>
              </div>
              <span className="online-dot" />
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="menu-button"
                aria-label={t('navigation')}
                onClick={() => setMobileNav(true)}
              >
                <Menu size={21} />
              </button>
              <span>{t('workspaceBreadcrumb')}</span>
              <ChevronRight size={14} />
              <strong>{navLabel(page)}</strong>
            </div>
            <div className="topbar-controls">
              <span className="demo-chip">
                <span />
                {t('demoLabel')}
              </span>
              <button
                className="language-button"
                onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
                aria-label={lang === 'en' ? '切换到中文' : 'Switch to English'}
              >
                <Languages size={17} />
                <span>{lang === 'en' ? '中文' : 'English'}</span>
              </button>
              <div className="role-select">
                <span className="role-dot" />
                <select
                  title={t('roleHint')}
                  aria-label={t('role')}
                  value={role}
                  onChange={(e) => {
                    const next = e.target.value as Role
                    setRole(next)
                    // 承包商只能看工单页
                    if (next === 'contractor') navigate('orders')
                  }}
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {t(r)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </header>
          <main>
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  {page === 'dashboard' ? t('greeting') : `HRT / ${navLabel(page)}`}
                </div>
                <h1>{page === 'dashboard' ? t('overviewHeading') : navLabel(page)}</h1>
                <p>{t((page + 'Subtitle') as TranslationKey)}</p>
              </div>
              <div className="heading-actions">
                {page === 'dashboard' || page === 'inspections' ? (
                  <Button
                    disabled={!permitted(['manager'])}
                    title={!permitted(['manager']) ? t('roleLocked') : undefined}
                    onClick={() => setModal({ type: 'schedule' })}
                  >
                    <Plus size={17} />
                    {t('scheduleInspection')}
                  </Button>
                ) : page === 'vehicles' ? (
                  <Button
                    disabled={!permitted(['manager'])}
                    title={!permitted(['manager']) ? t('roleLocked') : undefined}
                    onClick={() => setModal({ type: 'vehicleForm' })}
                  >
                    <Plus size={17} />
                    {t('addVehicle')}
                  </Button>
                ) : page === 'defects' ? (
                  <Button
                    disabled={!permitted(['inspector'])}
                    title={t('roleLocked')}
                    onClick={() => setModal({ type: 'defect' })}
                  >
                    <Plus size={17} />
                    {t('newDefect')}
                  </Button>
                ) : (
                  <span className="date-pill">
                    <CalendarClock size={16} />
                    {t('demoDate')} · {DEMO_DATE}
                  </span>
                )}
              </div>
            </div>
            {storageError && <div className="notice notice-warning">{t('storageError')}</div>}
            {isContractor && <div className="notice portal-notice">{t('portalNote')}</div>}
            {page === 'dashboard' ? (
              <>
                <div className="dashboard-filters">{scopeSelects}</div>
                <section className="fleet-hero">
                  <div className="hero-overview">
                    <div className="hero-eyebrow">
                      <span className="live-dot" />
                      {t('operationalSummary')}
                    </div>
                    <div className="availability-line">
                      <strong>
                        {availability}
                        <span>%</span>
                      </strong>
                      <div>
                        <h2>{t('fleetAvailability')}</h2>
                        <p>
                          {count('available')} / {fleet.length} {t('readyForService')}
                        </p>
                      </div>
                    </div>
                    <div className="availability-track">
                      {(['available', 'maintenance', 'grounded', 'awaitingRelease'] as const).map(
                        (s) => (
                          <span
                            key={s}
                            className={`track-${s}`}
                            style={{
                              width: `${fleet.length ? (count(s) / fleet.length) * 100 : 0}%`,
                            }}
                          />
                        ),
                      )}
                    </div>
                    <button className="hero-link" onClick={() => navigate('vehicles')}>
                      {t('viewFleet')}
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <div className="hero-stats">
                    {(['available', 'maintenance', 'grounded', 'awaitingRelease'] as const).map(
                      (s, i) => (
                        <button
                          key={s}
                          className="hero-stat"
                          onClick={() => navigate('vehicles', s)}
                        >
                          <span className={`hero-stat-icon stat-${s}`}>
                            {i === 0 ? (
                              <CheckCircle2 size={18} />
                            ) : i === 1 ? (
                              <Wrench size={18} />
                            ) : i === 2 ? (
                              <TriangleAlert size={18} />
                            ) : (
                              <ShieldCheck size={18} />
                            )}
                          </span>
                          <span>{t(s === 'maintenance' ? 'maintenanceStatus' : s)}</span>
                          <strong>
                            {String(count(s)).padStart(2, '0')}
                            <small>{t('vehiclesUnit')}</small>
                          </strong>
                        </button>
                      ),
                    )}
                  </div>
                  <div className="hero-decoration" />
                </section>
                <section className="queue-section">
                  <SectionHeader title={t('actionQueue')} sub={t('actionQueueSub')} />
                  <div className="queue-grid">
                    {queue.map((q) => (
                      <button
                        className="queue-card"
                        key={q.key}
                        onClick={() => navigate(q.page, q.filter)}
                      >
                        <span className={`queue-icon queue-${q.color}`}>
                          <q.icon size={19} />
                        </span>
                        <span className="queue-text">
                          {t(q.key)}
                          <strong>{String(q.value).padStart(2, '0')}</strong>
                        </span>
                        <ArrowUpRight size={18} className="queue-arrow" />
                      </button>
                    ))}
                  </div>
                </section>
                <div className="dashboard-bottom">
                  <section className="panel fleet-panel">
                    <SectionHeader
                      title={t('fleetSnapshot')}
                      sub={t('fleetSnapshotSub')}
                      action={
                        <LinkButton onClick={() => navigate('vehicles')}>{t('viewAll')}</LinkButton>
                      }
                    />
                    {vehicleTable(fleet.slice(0, 5))}
                    <div className="panel-footer">
                      <span>
                        {fleet.length} {t('totalFleet')}
                      </span>
                      <button onClick={() => navigate('vehicles')}>
                        {t('viewFleet')}
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  </section>
                  <section className="panel activity-panel">
                    <SectionHeader title={t('recentActivity')} sub={t('recentActivitySub')} />
                    <div className="timeline">
                      {state.audit.slice(0, 5).map((e) => (
                        <div className="timeline-item" key={e.id}>
                          <span className="timeline-marker">
                            <CheckCircle2 size={15} />
                          </span>
                          <div>
                            <p>{tx(e.message)}</p>
                            <small>{e.actor}</small>
                            <button
                              className="timeline-id"
                              onClick={() =>
                                e.entityId.startsWith('WO')
                                  ? setModal({ type: 'order', id: e.entityId })
                                  : e.entityId.startsWith('IN')
                                    ? setModal({ type: 'inspection', id: e.entityId })
                                    : e.vehicleId
                                      ? setModal({ type: 'vehicle', id: e.vehicleId })
                                      : navigate('parts')
                              }
                            >
                              {e.entityId}
                              <ArrowUpRight size={11} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="activity-note">
                      <ShieldCheck size={17} />
                      {t('dataSaved')}
                    </div>
                  </section>
                </div>
              </>
            ) : (
              <>
                <div className="list-stats">
                  {page === 'vehicles'
                    ? (['available', 'maintenance', 'grounded', 'awaitingRelease'] as const).map(
                        (s) => (
                          <button
                            className={filter === s ? 'selected' : ''}
                            key={s}
                            onClick={() => setFilter(filter === s ? 'all' : s)}
                          >
                            <Badge status={s} />
                            <strong>{count(s)}</strong>
                          </button>
                        ),
                      )
                    : page === 'inspections'
                      ? ['pending', 'overdue', 'passed', 'failed'].map((s) => (
                          <button
                            className={filter === s ? 'selected' : ''}
                            key={s}
                            onClick={() => setFilter(filter === s ? 'all' : s)}
                          >
                            <Badge status={s} />
                            <strong>
                              {state.inspections.filter((i) => inspectionStatus(i) === s).length}
                            </strong>
                          </button>
                        ))
                      : page === 'orders'
                        ? ['pending', 'assigned', 'progress', 'review', 'closed'].map((s) => (
                            <button
                              className={filter === s ? 'selected' : ''}
                              key={s}
                              onClick={() => setFilter(filter === s ? 'all' : s)}
                            >
                              <Badge status={s} />
                              <strong>{portalOrders.filter((o) => o.status === s).length}</strong>
                            </button>
                          ))
                        : page === 'defects'
                          ? ['open', 'processing', 'resolved'].map((s) => (
                              <button
                                className={filter === s ? 'selected' : ''}
                                key={s}
                                onClick={() => setFilter(filter === s ? 'all' : s)}
                              >
                                <Badge status={s} />
                                <strong>
                                  {state.defects.filter((d) => d.status === s).length}
                                </strong>
                              </button>
                            ))
                          : page === 'maintenance'
                            ? ['overdue', 'dueSoon', 'scheduled'].map((s) => (
                                <button
                                  className={filter === s ? 'selected' : ''}
                                  key={s}
                                  onClick={() => setFilter(filter === s ? 'all' : s)}
                                >
                                  <Badge status={s} />
                                  <strong>
                                    {state.plans.filter((p) => planStatus(p, state) === s).length}
                                  </strong>
                                </button>
                              ))
                            : ['healthyStock', 'lowStock'].map((s) => (
                                <button
                                  className={filter === s ? 'selected' : ''}
                                  key={s}
                                  onClick={() => setFilter(filter === s ? 'all' : s)}
                                >
                                  <Badge status={s} />
                                  <strong>
                                    {
                                      state.parts.filter(
                                        (p) =>
                                          (p.stock <= p.minStock ? 'lowStock' : 'healthyStock') ===
                                          s,
                                      ).length
                                    }
                                  </strong>
                                </button>
                              ))}
                </div>
                <section className="panel list-panel">
                  <SectionHeader
                    title={t(
                      page === 'vehicles'
                        ? 'vehicleProfile'
                        : page === 'inspections'
                          ? 'inspectionList'
                          : page === 'orders'
                            ? 'workOrderList'
                            : page === 'defects'
                              ? 'defectList'
                              : page === 'maintenance'
                                ? 'servicePlans'
                                : 'inventory',
                    )}
                    action={
                      <Button variant="outline" size="sm" onClick={exportCsv}>
                        <Download size={15} />
                        {t('export')}
                      </Button>
                    }
                  />
                  <Toolbar
                    query={query}
                    setQuery={setQuery}
                    filter={filter}
                    setFilter={setFilter}
                    statuses={
                      page === 'vehicles'
                        ? ['available', 'maintenance', 'grounded', 'awaitingRelease', 'inactive']
                        : page === 'inspections'
                          ? ['pending', 'overdue', 'passed', 'failed']
                          : page === 'orders'
                            ? ['pending', 'assigned', 'progress', 'review', 'returned', 'closed']
                            : page === 'defects'
                              ? ['open', 'processing', 'resolved', 'critical', 'minor']
                              : page === 'maintenance'
                                ? ['overdue', 'dueSoon', 'scheduled']
                                : ['healthyStock', 'lowStock']
                    }
                  >
                    {page !== 'parts' && !isContractor && scopeSelects}
                  </Toolbar>
                  {page === 'vehicles' ? (
                    vehicleTable(vehicles)
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            {(page === 'inspections'
                              ? [
                                  'recordId',
                                  'vehicle',
                                  'date',
                                  'type',
                                  'assignee',
                                  'status',
                                  'action',
                                ]
                              : page === 'defects'
                                ? [
                                    'recordId',
                                    'vehicle',
                                    'description',
                                    'severity',
                                    'status',
                                    'action',
                                  ]
                                : page === 'orders'
                                  ? [
                                      'recordId',
                                      'vehicle',
                                      'repairTask',
                                      'assignee',
                                      'status',
                                      'action',
                                    ]
                                  : page === 'maintenance'
                                    ? [
                                        'vehicle',
                                        'service',
                                        'dueDate',
                                        'dueMileage',
                                        'dueHours',
                                        'status',
                                        'action',
                                      ]
                                    : [
                                        'part',
                                        'sku',
                                        'category',
                                        'stock',
                                        'unitPrice',
                                        'status',
                                        'action',
                                      ]
                            ).map((k) => (
                              <th key={k}>{t(k as TranslationKey)}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {page === 'inspections' &&
                            inspections.map((i) => (
                              <tr key={i.id}>
                                <td className="record-id">{i.id}</td>
                                <td>
                                  <button
                                    className="text-link"
                                    onClick={() => setModal({ type: 'vehicle', id: i.vehicleId })}
                                  >
                                    {i.vehicleId}
                                  </button>
                                </td>
                                <td>{i.date}</td>
                                <td>{t(i.type)}</td>
                                <td>
                                  <span className="person-cell">
                                    <span className="mini-avatar">{i.assignee[0]}</span>
                                    {i.assignee}
                                  </span>
                                </td>
                                <td>
                                  <Badge status={inspectionStatus(i)} />
                                </td>
                                <td>
                                  <LinkButton
                                    onClick={() => setModal({ type: 'inspection', id: i.id })}
                                  >
                                    {t(
                                      i.status === 'pending' ? 'completeInspection' : 'viewDetails',
                                    )}
                                  </LinkButton>
                                </td>
                              </tr>
                            ))}
                          {page === 'defects' &&
                            defects.map((d) => (
                              <tr key={d.id}>
                                <td className="record-id">{d.id}</td>
                                <td>
                                  <button
                                    className="text-link"
                                    onClick={() => setModal({ type: 'vehicle', id: d.vehicleId })}
                                  >
                                    {d.vehicleId}
                                  </button>
                                </td>
                                <td className="description-cell">
                                  {tx(d.description)}
                                  <small>{d.inspectionId || t('manual')}</small>
                                </td>
                                <td>
                                  <Badge status={d.severity} />
                                </td>
                                <td>
                                  <Badge status={d.status} />
                                </td>
                                <td>
                                  <LinkButton
                                    onClick={() => setModal({ type: 'defectDetail', id: d.id })}
                                  >
                                    {t('viewDetails')}
                                  </LinkButton>
                                </td>
                              </tr>
                            ))}
                          {page === 'orders' &&
                            orders.map((o) => (
                              <tr key={o.id}>
                                <td className="record-id">{o.id}</td>
                                <td>
                                  {isContractor ? (
                                    o.vehicleId
                                  ) : (
                                    <button
                                      className="text-link"
                                      onClick={() => setModal({ type: 'vehicle', id: o.vehicleId })}
                                    >
                                      {o.vehicleId}
                                    </button>
                                  )}
                                </td>
                                <td className="description-cell">
                                  {tx(o.title)}
                                  <small>{o.defectIds.join(', ') || o.planId}</small>
                                </td>
                                <td>
                                  {o.assignee ? (
                                    <span className="person-cell">
                                      <span className="mini-avatar">{o.assignee[0]}</span>
                                      {o.assignee}
                                    </span>
                                  ) : (
                                    <span className="muted">—</span>
                                  )}
                                </td>
                                <td>
                                  <Badge status={o.status} />
                                </td>
                                <td>
                                  <LinkButton onClick={() => setModal({ type: 'order', id: o.id })}>
                                    {t('openOrder')}
                                  </LinkButton>
                                </td>
                              </tr>
                            ))}
                          {page === 'maintenance' &&
                            plans.map((p) => (
                              <tr key={p.id}>
                                <td>
                                  <button
                                    className="text-link"
                                    onClick={() => setModal({ type: 'vehicle', id: p.vehicleId })}
                                  >
                                    {p.vehicleId}
                                  </button>
                                </td>
                                <td className="description-cell">
                                  {tx(p.title)}
                                  <small>
                                    {p.intervalDays} {t('days')} /{' '}
                                    {p.intervalMileage.toLocaleString()} km
                                  </small>
                                </td>
                                <td>{p.dueDate}</td>
                                <td className="numeric">{p.dueMileage.toLocaleString()} km</td>
                                <td className="numeric">{p.dueHours.toLocaleString()} h</td>
                                <td>
                                  <Badge status={planStatus(p, state)} />
                                </td>
                                <td>
                                  {p.orderId ? (
                                    <LinkButton
                                      onClick={() => setModal({ type: 'order', id: p.orderId! })}
                                    >
                                      {p.orderId}
                                    </LinkButton>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={role !== 'manager'}
                                      title={role !== 'manager' ? t('roleLocked') : undefined}
                                      onClick={() => {
                                        if (run({ type: 'createOrder', planId: p.id })) {
                                          navigate('orders')
                                        }
                                      }}
                                    >
                                      {t('createServiceOrder')}
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          {page === 'parts' &&
                            parts.map((p) => (
                              <tr key={p.id}>
                                <td>
                                  <div className="vehicle-cell">
                                    <span className="part-icon">
                                      <Package size={19} />
                                    </span>
                                    <strong>{tx(p.name)}</strong>
                                  </div>
                                </td>
                                <td className="record-id">{p.sku}</td>
                                <td>{tx(p.category)}</td>
                                <td className="stock-cell">
                                  <strong>{p.stock}</strong>
                                  <small>
                                    {t('reorderAt')}: {p.minStock}
                                  </small>
                                </td>
                                <td className="numeric">{money(p.price)}</td>
                                <td>
                                  <Badge
                                    status={p.stock <= p.minStock ? 'lowStock' : 'healthyStock'}
                                  />
                                </td>
                                <td>
                                  <LinkButton onClick={() => setModal({ type: 'part', id: p.id })}>
                                    {t('viewDetails')}
                                  </LinkButton>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {!visibleRecords.length && (
                        <Empty
                          clear={() => {
                            setQuery('')
                            setFilter('all')
                            setDepot('all')
                            setVehicleClass('all')
                          }}
                        />
                      )}
                    </div>
                  )}
                  <div className="panel-footer">
                    <span>
                      {visibleRecords.length} {t('records')}
                    </span>
                    <span>{page === 'maintenance' ? t('triggerNote') : t('demoHint')}</span>
                  </div>
                </section>
              </>
            )}
            <footer className="main-footer">
              <span>
                HRT fleet. <span className="footer-divider">/</span> {t('demo')}
              </span>
              <button onClick={() => setModal({ type: 'guide' })}>
                <CircleHelp size={14} />
                {t('flowTitle')}
              </button>
            </footer>
          </main>
        </div>
        <Modal
          key={modal ? JSON.stringify(modal) : 'closed'}
          modal={modal}
          setModal={setModal}
          reset={() => {
            setState(createSeed())
            setQuery('')
            setFilter('all')
            setDepot('all')
            setVehicleClass('all')
            setToast({ text: t('resetDone'), error: false })
          }}
        />
        {toast && (
          <div
            role={toast.error ? 'alert' : 'status'}
            className={`toast ${toast.error ? 'toast-error' : ''}`}
          >
            <CheckCircle2 size={19} />
            <span>{toast.text}</span>
            <button aria-label={t('close')} onClick={() => setToast(null)}>
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </FleetContext.Provider>
  )
}

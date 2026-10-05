import { useState, type FormEvent, type ReactNode } from 'react';
import {
  BusFront,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Wrench,
  ShieldCheck,
  ArrowRight,
  ClipboardCheck,
  Package,
  RotateCcw,
  Pencil,
  Radio,
  Landmark,
  Ban,
} from 'lucide-react';
import { useFleet } from '@/lib/context';
import {
  DEMO_DATE,
  checkKeys,
  staff,
  contractors,
  users,
  depots,
  vehicleClasses,
  type Check,
  type PartLine,
  type VehicleClass,
} from '@/lib/model';
import { releaseChecks, totalCost, costCode } from '@/lib/fleet';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Badge,
  Field,
  Info,
  RoleNote,
  Timeline,
  SectionHeader,
} from '@/components/common';
import type { TranslationKey } from '@/lib/i18n';

export type ModalState =
  | null
  | { type: 'schedule'; vehicleId?: string; reinspection?: boolean }
  | { type: 'defect' }
  | {
      type: 'inspection' | 'defectDetail' | 'order' | 'vehicle' | 'part';
      id: string;
    }
  | { type: 'reset' | 'guide' }
  | { type: 'vehicleForm'; id?: string };

export const Modal = ({
  modal,
  setModal,
  reset,
}: {
  modal: ModalState;
  setModal: (m: ModalState) => void;
  reset: () => void;
}) => {
  const { state, role, t, tx, money, run, lang } = useFleet();
  const close = () => setModal(null);
  const selectedOrder =
    modal?.type === 'order'
      ? state.orders.find((o) => o.id === modal.id)
      : undefined;
  const selectedInspection =
    modal?.type === 'inspection'
      ? state.inspections.find((i) => i.id === modal.id)
      : undefined;
  const activeVehicles = state.vehicles.filter((v) => v.active);
  const [vehicleId, setVehicleId] = useState(
    modal?.type === 'schedule' && modal.vehicleId
      ? modal.vehicleId
      : activeVehicles[0]?.id || '',
  );
  const editing =
    modal?.type === 'vehicleForm' && modal.id
      ? state.vehicles.find((v) => v.id === modal.id)
      : undefined;
  const [vehicleForm, setVehicleForm] = useState({
    id: editing?.id || '',
    plate: editing?.plate || '',
    model: editing?.model || '',
    vehicleClass: (editing?.vehicleClass || 'bus') as VehicleClass,
    year: editing?.year || 2026,
    depot: editing?.depot || depots[0],
    vin: editing?.vin || '',
    mileage: editing?.mileage || 0,
    hours: editing?.hours || 0,
  });
  const [date, setDate] = useState(DEMO_DATE),
    [inspectionType, setInspectionType] = useState<'routine' | 'reinspection'>(
      modal?.type === 'schedule' && modal.reinspection
        ? 'reinspection'
        : 'routine',
    );
  const [inspectionTime, setInspectionTime] = useState('09:00');
  const [inspector, setInspector] = useState('Jamie Chen'),
    [severity, setSeverity] = useState<'minor' | 'critical'>('minor'),
    [description, setDescription] = useState('');
  const [checks, setChecks] = useState<
    { key: string; result: '' | 'pass' | 'fail'; note: string }[]
  >(
    selectedInspection?.checks.length
      ? selectedInspection.checks
      : checkKeys.map((key) => ({ key, result: '', note: '' })),
  );
  const [inspectionNotes, setInspectionNotes] = useState(
    selectedInspection ? tx(selectedInspection.note) : '',
  );
  const [assignee, setAssignee] = useState(selectedOrder?.assignee || '');
  const [repairNote, setRepairNote] = useState(
    selectedOrder ? tx(selectedOrder.note) : '',
  );
  const [invoiceRef, setInvoiceRef] = useState(selectedOrder?.invoiceRef || '');
  const [partLines, setPartLines] = useState<PartLine[]>(
    selectedOrder?.parts || [],
  );
  const [labourHours, setLabourHours] = useState(
      selectedOrder?.labourHours || 0,
    ),
    [labourRate, setLabourRate] = useState(selectedOrder?.labourRate ?? 85);
  const [returnReason, setReturnReason] = useState(''),
    [showReturn, setShowReturn] = useState(false),
    [stockQuantity, setStockQuantity] = useState(1);

  if (!modal) return null;
  const submit = (
    e: FormEvent,
    action: Parameters<typeof run>[0],
    dismiss = true,
  ) => {
    e.preventDefault();
    if (run(action) && dismiss) close();
  };
  const options = (
    <>
      {activeVehicles.map((v) => (
        <option key={v.id} value={v.id}>
          {v.id} · {v.plate}
        </option>
      ))}
    </>
  );
  const footer = (label: string, disabled = false): ReactNode => (
    <div className="dialog-footer">
      <Button type="button" variant="outline" onClick={close}>
        {t('cancel')}
      </Button>
      <Button type="submit" disabled={disabled}>
        {label}
      </Button>
    </div>
  );
  let title = '',
    sub = '',
    content: ReactNode;

  if (modal.type === 'schedule') {
    title = t('inspectionForm');
    sub = t('inspectionFormSub');
    content = (
      <form
        onSubmit={(e) =>
          submit(e, {
            type: 'schedule',
            vehicleId,
            date,
            inspectionType,
            assignee: inspector,
            time: inspectionTime,
          })
        }
      >
        <RoleNote allowed={['manager']} />
        <div className="form-grid">
          <Field label={t('vehicle')}>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
            >
              {options}
            </select>
          </Field>
          <Field label={t('inspectionDate')}>
            <input
              type="date"
              min={DEMO_DATE}
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label={t('inspectionType')}>
            <select
              value={inspectionType}
              onChange={(e) =>
                setInspectionType(e.target.value as 'routine' | 'reinspection')
              }
            >
              <option value="routine">{t('routine')}</option>
              <option value="reinspection">{t('reinspection')}</option>
            </select>
          </Field>
          <Field label={t('inspectorName')}>
            <select
              value={inspector}
              onChange={(e) => setInspector(e.target.value)}
            >
              <option>Jamie Chen</option>
              <option>Robin Park</option>
            </select>
          </Field>
          <Field label={t('inspectionTime')}>
            <input
              type="time"
              required
              value={inspectionTime}
              onChange={(e) => setInspectionTime(e.target.value)}
            />
          </Field>
        </div>
        {footer(t('saveSchedule'), role !== 'manager')}
      </form>
    );
  } else if (modal.type === 'defect') {
    title = t('defectForm');
    sub = t('defectFormSub');
    content = (
      <form
        onSubmit={(e) =>
          submit(e, { type: 'defect', vehicleId, severity, description })
        }
      >
        <RoleNote allowed={['inspector']} />
        <div className="form-grid">
          <Field label={t('vehicle')}>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
            >
              {options}
            </select>
          </Field>
          <Field label={t('severity')}>
            <select
              value={severity}
              onChange={(e) =>
                setSeverity(e.target.value as 'minor' | 'critical')
              }
            >
              <option value="minor">{t('minor')}</option>
              <option value="critical">{t('critical')}</option>
            </select>
          </Field>
          <Field label={t('defectDescription')} span>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('defectDescription')}
            />
          </Field>
        </div>
        {footer(t('saveDefect'), role !== 'inspector')}
      </form>
    );
  } else if (modal.type === 'inspection' && selectedInspection) {
    const i = selectedInspection;
    title = `${i.id} · ${i.vehicleId}`;
    sub = t('inspectionResultSub');
    const editable =
      i.status === 'pending' &&
      role === 'inspector' &&
      i.assignee === users.inspector &&
      i.date <= DEMO_DATE;
    content = (
      <form
        onSubmit={(e) =>
          submit(e, {
            type: 'inspect',
            id: i.id,
            checks: checks as Check[],
            note: inspectionNotes,
          })
        }
      >
        <div className="detail-strip">
          <Badge status={i.status} />
          <span>{t(i.type)}</span>
          <span>
            {i.date} {i.time || ''}
          </span>
          <span>{i.assignee}</span>
        </div>
        {i.status === 'pending' && <RoleNote allowed={['inspector']} />}
        <h3 className="block-title">{t('checks')}</h3>
        <div className="checklist">
          {checks.map((c, index) => (
            <div className="inspection-check" key={c.key}>
              <div className="inspection-check-head">
                <span>
                  <span className="check-number">0{index + 1}</span>
                  {t(c.key as TranslationKey)}
                </span>
                <select
                  aria-label={t(c.key as TranslationKey)}
                  required
                  disabled={!editable}
                  value={c.result}
                  onChange={(e) =>
                    setChecks(
                      checks.map((x) =>
                        x.key === c.key
                          ? { ...x, result: e.target.value as 'pass' | 'fail' }
                          : x,
                      ),
                    )
                  }
                >
                  <option value="" disabled>
                    —
                  </option>
                  <option value="pass">{t('pass')}</option>
                  <option value="fail">{t('fail')}</option>
                </select>
              </div>
              {c.result === 'fail' && (
                <input
                  required
                  disabled={!editable}
                  aria-label={`${t('failureReason')} ${t(c.key as TranslationKey)}`}
                  value={c.note}
                  placeholder={t('failureReason')}
                  onChange={(e) =>
                    setChecks(
                      checks.map((x) =>
                        x.key === c.key ? { ...x, note: e.target.value } : x,
                      ),
                    )
                  }
                />
              )}
            </div>
          ))}
        </div>
        <Field label={t('inspectionNotes')}>
          <textarea
            rows={3}
            disabled={!editable}
            value={inspectionNotes}
            onChange={(e) => setInspectionNotes(e.target.value)}
          />
        </Field>
        {i.status !== 'pending' ? (
          <div className="notice notice-success">
            <CheckCircle2 size={17} />
            {t('inspectionComplete')}
          </div>
        ) : (
          footer(t('submitInspection'), !editable)
        )}
        <h3 className="block-title">{t('history')}</h3>
        <Timeline entityId={i.id} />
      </form>
    );
  } else if (modal.type === 'defectDetail') {
    const d = state.defects.find((d) => d.id === modal.id)!;
    title = `${d.id} · ${d.vehicleId}`;
    sub = t('defectDetails');
    content = (
      <>
        <div className="detail-strip">
          <Badge status={d.severity} />
          <Badge status={d.status} />
          <span>{d.date}</span>
        </div>
        <div className="detail-description">{tx(d.description)}</div>
        <div className="info-grid">
          <Info label={t('source')}>
            {d.inspectionId ? (
              <button
                className="text-link"
                onClick={() =>
                  setModal({ type: 'inspection', id: d.inspectionId! })
                }
              >
                {d.inspectionId}
              </button>
            ) : (
              t('manual')
            )}
          </Info>
          <Info label={t('linkedOrder')}>
            {d.orderId ? (
              <button
                className="text-link"
                onClick={() => setModal({ type: 'order', id: d.orderId! })}
              >
                {d.orderId}
              </button>
            ) : (
              '—'
            )}
          </Info>
        </div>
        {!d.orderId && d.status !== 'resolved' && (
          <>
            <RoleNote allowed={['manager']} />
            <div className="dialog-footer">
              <Button
                disabled={role !== 'manager'}
                onClick={() => {
                  if (run({ type: 'createOrder', defectId: d.id })) close();
                }}
              >
                <Plus size={17} />
                {t('createOrder')}
              </Button>
            </div>
          </>
        )}
        <h3 className="block-title">{t('history')}</h3>
        <Timeline entityId={d.id} />
      </>
    );
  } else if (modal.type === 'order' && selectedOrder) {
    const o = selectedOrder;
    title = `${o.id} · ${o.vehicleId}`;
    sub = tx(o.title);
    // 负责人可能是技师也可能是承包商
    const byContractor = contractors.includes(o.assignee);
    const worker = byContractor ? 'contractor' : 'technician';
    const isAssignee = role === worker && o.assignee === users[role];
    const editable = ['progress', 'returned'].includes(o.status) && isAssignee;
    const assignable =
      !['review', 'closed'].includes(o.status) && role === 'manager';
    const updateLine = (
      index: number,
      key: keyof PartLine,
      value: string | number,
    ) =>
      setPartLines(
        partLines.map((p, i) => (i === index ? { ...p, [key]: value } : p)),
      );
    const sum = totalCost({ parts: partLines, labourHours, labourRate });
    content = (
      <>
        <div className="detail-strip">
          <Badge status={o.status} />
          <span>{o.date}</span>
          <span>{o.defectIds.join(', ') || o.planId}</span>
        </div>
        <section className="assignment-block">
          <SectionHeader title={t('assignment')} />
          <div className="assignment-row">
            <select
              aria-label={t('chooseTechnician')}
              disabled={!assignable}
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="">{t('chooseTechnician')}</option>
              <optgroup label={t('internalStaff')}>
                {staff.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </optgroup>
              <optgroup label={t('approvedContractors')}>
                {contractors.map((s) => (
                  <option key={s} value={s}>
                    {s} · {t('contractorTag')}
                  </option>
                ))}
              </optgroup>
            </select>
            <Button
              variant="outline"
              disabled={!assignable || !assignee || assignee === o.assignee}
              onClick={() => run({ type: 'assign', id: o.id, assignee })}
            >
              {t('saveAssignment')}
            </Button>
          </div>
          {o.status === 'assigned' && (
            <div className="start-row">
              <RoleNote allowed={[worker]} />
              <Button
                disabled={!isAssignee}
                onClick={() => run({ type: 'start', id: o.id })}
              >
                <Wrench size={16} />
                {t('startRepair')}
              </Button>
            </div>
          )}
          {(role === 'technician' || role === 'contractor') &&
            o.assignee !== users[role] && (
              <div className="notice">{t('assignedOther')}</div>
            )}
        </section>
        {o.rejection && (
          <div className="notice notice-warning">
            <XCircle size={18} />
            <div>
              <strong>{t('returnedNote')}</strong>
              <p>{tx(o.rejection)}</p>
            </div>
          </div>
        )}
        <form
          onSubmit={(e) =>
            submit(
              e,
              {
                type: 'submit',
                id: o.id,
                note: repairNote,
                parts: partLines,
                labourHours,
                labourRate,
                invoiceRef: byContractor ? invoiceRef : undefined,
              },
              false,
            )
          }
        >
          <h3 className="block-title">{t('repairRecord')}</h3>
          <Field label={t('repairNotes')}>
            <textarea
              required
              disabled={!editable}
              rows={3}
              placeholder={t('repairNotes')}
              value={repairNote}
              onChange={(e) => setRepairNote(e.target.value)}
            />
          </Field>
          <div className="block-heading">
            <h3>{t('partsUsed')}</h3>
            {editable && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setPartLines([
                    ...partLines,
                    {
                      partId: state.parts[0].id,
                      quantity: 1,
                      price: state.parts[0].price,
                    },
                  ])
                }
              >
                <Plus size={14} />
                {t('addPart')}
              </Button>
            )}
          </div>
          {!partLines.length ? (
            <div className="no-parts">
              <Package size={18} />
              {t('noParts')}
            </div>
          ) : (
            <div className="parts-lines">
              {partLines.map((line, index) => (
                <div className="part-line" key={index}>
                  <Field label={t('part')}>
                    <select
                      disabled={!editable}
                      value={line.partId}
                      onChange={(e) => {
                        const p = state.parts.find(
                          (p) => p.id === e.target.value,
                        )!;
                        setPartLines(
                          partLines.map((l, i) =>
                            i === index
                              ? { ...l, partId: p.id, price: p.price }
                              : l,
                          ),
                        );
                      }}
                    >
                      {state.parts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {tx(p.name)} ({p.stock})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('quantity')}>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      required
                      disabled={!editable}
                      value={line.quantity}
                      onChange={(e) =>
                        updateLine(index, 'quantity', Number(e.target.value))
                      }
                    />
                  </Field>
                  <Field label={`${t('unitPrice')} AUD`}>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      disabled={!editable}
                      value={line.price}
                      onChange={(e) =>
                        updateLine(index, 'price', Number(e.target.value))
                      }
                    />
                  </Field>
                  <button
                    type="button"
                    className="remove-part"
                    disabled={!editable}
                    aria-label={`${t('remove')} ${index + 1}`}
                    onClick={() =>
                      setPartLines(partLines.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {editable && <p className="form-hint">{t('stockNote')}</p>}
          <div className="form-grid labour-fields">
            <Field label={t('hours')}>
              <input
                type="number"
                min="0.25"
                step="0.25"
                required
                disabled={!editable}
                value={labourHours}
                onChange={(e) => setLabourHours(Number(e.target.value))}
              />
            </Field>
            <Field label={`${t('hourlyRate')} AUD`}>
              <input
                type="number"
                min={0}
                step="0.01"
                required
                disabled={!editable}
                value={labourRate}
                onChange={(e) => setLabourRate(Number(e.target.value))}
              />
            </Field>
          </div>
          {byContractor && (
            <Field label={t('invoiceRef')}>
              <input
                required
                disabled={!editable}
                value={invoiceRef}
                placeholder="INV-"
                onChange={(e) => setInvoiceRef(e.target.value)}
              />
            </Field>
          )}
          {byContractor && editable && (
            <p className="form-hint">{t('invoiceHint')}</p>
          )}
          <div className="cost-summary">
            <div>
              <span>{t('partsTotal')}</span>
              <strong>
                {money(
                  partLines.reduce((sum, p) => sum + p.quantity * p.price, 0),
                )}
              </strong>
            </div>
            <div>
              <span>{t('labourTotal')}</span>
              <strong>{money(labourHours * labourRate)}</strong>
            </div>
            <div className="cost-total">
              <span>{t('total')}</span>
              <strong>{money(sum)}</strong>
            </div>
          </div>
          {editable && (
            <div className="dialog-footer">
              <Button type="submit">
                {t('submitRepair')}
                <ArrowRight size={16} />
              </Button>
            </div>
          )}
        </form>
        {o.status === 'review' && (
          <section className="review-block">
            <h3>{t('reviewRepair')}</h3>
            <RoleNote allowed={['reviewer']} />
            {!showReturn ? (
              <div className="review-actions">
                <Button
                  variant="outline"
                  disabled={role !== 'reviewer'}
                  onClick={() => setShowReturn(true)}
                >
                  {t('returnRepair')}
                </Button>
                <Button
                  disabled={role !== 'reviewer'}
                  onClick={() => run({ type: 'approve', id: o.id })}
                >
                  <ShieldCheck size={16} />
                  {t('approve')}
                </Button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (run({ type: 'reject', id: o.id, reason: returnReason }))
                    setShowReturn(false);
                }}
              >
                <Field label={t('returnReason')}>
                  <textarea
                    required
                    rows={3}
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder={t('returnNotes')}
                  />
                </Field>
                <div className="dialog-footer">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowReturn(false)}
                  >
                    {t('cancel')}
                  </Button>
                  <Button type="submit" disabled={role !== 'reviewer'}>
                    {t('confirmReturn')}
                  </Button>
                </div>
              </form>
            )}
          </section>
        )}
        {o.status === 'closed' && (
          <div className="notice notice-success">
            <CheckCircle2 size={18} />
            {t('orderClosed')}
          </div>
        )}
        {o.status === 'closed' && o.finance && (
          <section className="finance-block">
            <SectionHeader title={t('financeTitle')} sub={t('financeHint')} />
            <div className="info-grid">
              <Info label={t('costCode')}>{costCode(o)}</Info>
              <Info label={t('total')}>{money(totalCost(o))}</Info>
              <Info label={t('status')}>
                <Badge status={o.finance} />
              </Info>
              <Info label={t('financeRef')}>{o.financeRef || '—'}</Info>
            </div>
            {o.finance === 'financePending' && (
              <>
                <RoleNote allowed={['manager']} />
                <div className="dialog-footer">
                  <Button
                    disabled={role !== 'manager'}
                    onClick={() => run({ type: 'postFinance', id: o.id })}
                  >
                    <Landmark size={16} />
                    {t('postFinance')}
                  </Button>
                </div>
              </>
            )}
          </section>
        )}
        <h3 className="block-title">{t('history')}</h3>
        <Timeline entityId={o.id} />
      </>
    );
  } else if (modal.type === 'vehicle') {
    const v = state.vehicles.find((v) => v.id === modal.id)!,
      checks = releaseChecks(state, v.id);
    title = v.id;
    sub = `${v.plate} · ${v.model}`;
    content = (
      <>
        <div className="vehicle-profile-header">
          <span className="big-vehicle-icon">
            <BusFront size={34} strokeWidth={1.5} />
          </span>
          <div>
            <Badge status={v.active ? v.status : 'inactive'} />
            <p>
              {v.depot} · {t(v.vehicleClass)}
            </p>
          </div>
          {v.active && (
            <div className="profile-actions">
              <Button
                variant="outline"
                size="sm"
                disabled={role !== 'manager'}
                title={role !== 'manager' ? t('roleLocked') : undefined}
                onClick={() => setModal({ type: 'vehicleForm', id: v.id })}
              >
                <Pencil size={14} />
                {t('editVehicle')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={role !== 'manager'}
                onClick={() =>
                  run({ type: 'deactivateVehicle', vehicleId: v.id })
                }
              >
                <Ban size={14} />
                {t('deactivate')}
              </Button>
            </div>
          )}
        </div>
        <div className="info-grid profile-info">
          <Info label={t('mileage')}>{v.mileage.toLocaleString()} km</Info>
          <Info label={t('engineHours')}>{v.hours.toLocaleString()} h</Info>
          <Info label={t('year')}>{v.year}</Info>
          <Info label={t('vin')}>{v.vin}</Info>
        </div>
        <div className="telemetry-line">
          <Radio size={16} />
          <span>
            {t('telemetrySynced')}:{' '}
            {new Date(v.telemetryAt).toLocaleString(
              lang === 'zh' ? 'zh-CN' : 'en-AU',
              {
                timeZone: 'Australia/Sydney',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              },
            )}
          </span>
          {v.active && (
            <Button
              variant="outline"
              size="sm"
              disabled={role !== 'manager'}
              onClick={() => run({ type: 'syncTelemetry', vehicleId: v.id })}
            >
              {t('syncTelemetry')}
            </Button>
          )}
        </div>
        {v.active && role === 'manager' && (
          <p className="form-hint">
            {t('telemetryHint')} {t('deactivateHint')}
          </p>
        )}
        <div className="release-block">
          <SectionHeader title={t('releaseCheck')} sub={t('releaseSub')} />
          {(
            [
              { key: 'inspection', label: 'inspectionCheck' },
              { key: 'defects', label: 'defectCheck' },
              { key: 'orders', label: 'orderCheck' },
            ] as const
          ).map((c) => (
            <div className="release-line" key={c.key}>
              <span className={checks[c.key] ? 'check-ready' : 'check-blocked'}>
                {checks[c.key] ? (
                  <CheckCircle2 size={18} />
                ) : (
                  <XCircle size={18} />
                )}
              </span>
              <span>{t(c.label)}</span>
              <strong
                className={checks[c.key] ? 'check-ready' : 'check-blocked'}
              >
                {t(checks[c.key] ? 'ready' : 'blocked')}
              </strong>
            </div>
          ))}
          <RoleNote allowed={['reviewer']} />
          <div className="release-actions">
            {!checks.inspection && (
              <Button
                variant="outline"
                disabled={role !== 'manager'}
                onClick={() =>
                  setModal({
                    type: 'schedule',
                    vehicleId: v.id,
                    reinspection: true,
                  })
                }
              >
                <ClipboardCheck size={16} />
                {t('scheduleReinspection')}
              </Button>
            )}
            <Button
              disabled={
                v.status !== 'awaitingRelease' ||
                !checks.ready ||
                role !== 'reviewer'
              }
              onClick={() => run({ type: 'release', vehicleId: v.id })}
            >
              <ShieldCheck size={16} />
              {t(
                v.status === 'available'
                  ? 'alreadyAvailable'
                  : 'confirmRelease',
              )}
            </Button>
          </div>
          {!checks.ready && <p className="form-hint">{t('releaseNeeds')}</p>}
        </div>
        <div className="vehicle-history">
          <h3>{t('vehicleInspections')}</h3>
          {state.inspections
            .filter((i) => i.vehicleId === v.id)
            .map((i) => (
              <button
                className="history-row"
                key={i.id}
                onClick={() => setModal({ type: 'inspection', id: i.id })}
              >
                <span>
                  <strong>{i.id}</strong>
                  <small>
                    {t(i.type)} · {i.date}
                  </small>
                </span>
                <Badge status={i.status} />
                <ArrowRight size={15} />
              </button>
            ))}
          <h3>{t('vehicleDefects')}</h3>
          {state.defects
            .filter((d) => d.vehicleId === v.id)
            .map((d) => (
              <button
                className="history-row"
                key={d.id}
                onClick={() => setModal({ type: 'defectDetail', id: d.id })}
              >
                <span>
                  <strong>{d.id}</strong>
                  <small>{tx(d.description)}</small>
                </span>
                <Badge status={d.status} />
                <ArrowRight size={15} />
              </button>
            ))}
          <h3>{t('vehicleOrders')}</h3>
          {state.orders
            .filter((o) => o.vehicleId === v.id)
            .map((o) => (
              <button
                className="history-row"
                key={o.id}
                onClick={() => setModal({ type: 'order', id: o.id })}
              >
                <span>
                  <strong>{o.id}</strong>
                  <small>{tx(o.title)}</small>
                </span>
                <Badge status={o.status} />
                <ArrowRight size={15} />
              </button>
            ))}
        </div>
        <h3 className="block-title">{t('history')}</h3>
        <Timeline vehicleId={v.id} />
      </>
    );
  } else if (modal.type === 'part') {
    const p = state.parts.find((p) => p.id === modal.id)!;
    title = tx(p.name);
    sub = `${p.sku} · ${tx(p.category)}`;
    content = (
      <>
        <div className="info-grid">
          <Info label={t('stock')}>
            {p.stock} {t('units')}
          </Info>
          <Info label={t('reorderAt')}>{p.minStock}</Info>
          <Info label={t('unitPrice')}>{money(p.price)}</Info>
          <Info label={t('status')}>
            <Badge
              status={p.stock <= p.minStock ? 'lowStock' : 'healthyStock'}
            />
          </Info>
        </div>
        <h3 className="block-title">{t('receiveStock')}</h3>
        <RoleNote allowed={['manager']} />
        <form
          onSubmit={(e) =>
            submit(
              e,
              { type: 'restock', id: p.id, quantity: stockQuantity },
              false,
            )
          }
        >
          <div className="assignment-row">
            <Field label={t('receiveQuantity')}>
              <input
                required
                type="number"
                min={1}
                step={1}
                value={stockQuantity}
                onChange={(e) => setStockQuantity(Number(e.target.value))}
              />
            </Field>
            <Button disabled={role !== 'manager'} type="submit">
              {t('saveStock')}
            </Button>
          </div>
        </form>
        <h3 className="block-title">{t('stockMovements')}</h3>
        {state.orders
          .filter((o) => (o.issued[p.id] || 0) > 0)
          .map((o) => (
            <button
              className="history-row"
              key={o.id}
              onClick={() => setModal({ type: 'order', id: o.id })}
            >
              <span>
                <strong>
                  {o.id} · {o.vehicleId}
                </strong>
                <small>
                  {t('issuedTo')}: {o.assignee}
                </small>
              </span>
              <span>
                {o.issued[p.id]} {t('units')}
              </span>
              <ArrowRight size={15} />
            </button>
          ))}
        {!state.orders.some((o) => o.issued[p.id]) && (
          <p className="muted">{t('noUsage')}</p>
        )}
        <h3 className="block-title">{t('history')}</h3>
        <Timeline entityId={p.id} />
      </>
    );
  } else if (modal.type === 'vehicleForm') {
    title = editing ? `${t('editVehicle')} · ${editing.id}` : t('addVehicle');
    sub = t(editing ? 'vehicleFormEdit' : 'vehicleFormNew');
    const set = (key: keyof typeof vehicleForm, value: string | number) =>
      setVehicleForm({ ...vehicleForm, [key]: value });
    content = (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (
            run({ type: 'saveVehicle', isNew: !editing, vehicle: vehicleForm })
          )
            setModal({
              type: 'vehicle',
              id: vehicleForm.id.trim().toUpperCase(),
            });
        }}
      >
        <RoleNote allowed={['manager']} />
        <div className="form-grid">
          <Field label={t('fleetNumber')}>
            <input
              required
              disabled={!!editing}
              value={vehicleForm.id}
              placeholder="BUS 110"
              onChange={(e) => set('id', e.target.value)}
            />
          </Field>
          <Field label={t('plate')}>
            <input
              required
              value={vehicleForm.plate}
              placeholder="HRT110"
              onChange={(e) => set('plate', e.target.value)}
            />
          </Field>
          <Field label={t('model')}>
            <input
              required
              value={vehicleForm.model}
              onChange={(e) => set('model', e.target.value)}
            />
          </Field>
          <Field label={t('vehicleClass')}>
            <select
              value={vehicleForm.vehicleClass}
              onChange={(e) => set('vehicleClass', e.target.value)}
            >
              {vehicleClasses.map((c) => (
                <option key={c} value={c}>
                  {t(c)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('year')}>
            <input
              type="number"
              required
              min={1990}
              max={2027}
              step={1}
              value={vehicleForm.year}
              onChange={(e) => set('year', Number(e.target.value))}
            />
          </Field>
          <Field label={t('depot')}>
            <select
              value={vehicleForm.depot}
              onChange={(e) => set('depot', e.target.value)}
            >
              {depots.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label={t('vin')} span>
            <input
              required
              value={vehicleForm.vin}
              onChange={(e) => set('vin', e.target.value)}
            />
          </Field>
          <Field label={`${t('mileage')} km`}>
            <input
              type="number"
              required
              min={0}
              value={vehicleForm.mileage}
              onChange={(e) => set('mileage', Number(e.target.value))}
            />
          </Field>
          <Field label={`${t('engineHours')} h`}>
            <input
              type="number"
              required
              min={0}
              value={vehicleForm.hours}
              onChange={(e) => set('hours', Number(e.target.value))}
            />
          </Field>
        </div>
        {footer(t('saveVehicle'), role !== 'manager')}
      </form>
    );
  } else if (modal.type === 'reset') {
    title = t('resetTitle');
    sub = t('resetBody');
    content = (
      <div className="reset-dialog">
        <span className="reset-illustration">
          <RotateCcw size={30} />
        </span>
        <div className="dialog-footer">
          <Button variant="outline" onClick={close}>
            {t('cancel')}
          </Button>
          <Button
            onClick={() => {
              reset();
              close();
            }}
          >
            {t('resetConfirm')}
          </Button>
        </div>
      </div>
    );
  } else if (modal.type === 'guide') {
    title = t('flowTitle');
    sub = t('flowBody');
    content = (
      <div className="guide">
        <div className="guide-flow">{t('flowSteps')}</div>
        {(
          [
            {
              role: 'manager',
              label: 'scheduleInspection',
              icon: ClipboardCheck,
            },
            {
              role: 'inspector',
              label: 'completeInspection',
              icon: ClipboardCheck,
            },
            { role: 'manager', label: 'createOrder', icon: Wrench },
            { role: 'technician', label: 'submitRepair', icon: Wrench },
            { role: 'reviewer', label: 'approve', icon: ShieldCheck },
            { role: 'inspector', label: 'reinspection', icon: ClipboardCheck },
            { role: 'reviewer', label: 'confirmRelease', icon: BusFront },
          ] as const
        ).map((step, index) => (
          <div className="guide-step" key={index}>
            <span className="guide-index">{index + 1}</span>
            <step.icon size={19} />
            <strong>{t(step.label)}</strong>
            <span>{t(step.role)}</span>
          </div>
        ))}
        <p className="form-hint">{t('roleHint')}</p>
        <div className="dialog-footer">
          <Button onClick={close}>{t('close')}</Button>
        </div>
      </div>
    );
  }
  return (
    <Dialog
      open={!!modal}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent closeLabel={t('close')}>
        <div className="dialog-heading">
          <span className="eyebrow">HRT / {t('demo')}</span>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{sub}</DialogDescription>
        </div>
        <div className="dialog-body">{content}</div>
      </DialogContent>
    </Dialog>
  );
};

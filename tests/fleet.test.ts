import test from 'node:test'
import assert from 'node:assert/strict'
import { createSeed } from '../src/lib/seed'
import {
  transition,
  releaseChecks,
  inspectionStatus,
  planStatus,
  totalCost,
  FleetError,
} from '../src/lib/fleet'
import { checkKeys, type FleetState } from '../src/lib/model'

const passed = checkKeys.map((key) => ({ key, result: 'pass' as const, note: '' }))

const payload = {
  type: 'submit' as const,
  id: 'WO-0042',
  note: 'Brake pads replaced and tested.',
  parts: [{ partId: 'PT-0001', quantity: 2, price: 150 }],
  labourHours: 2,
  labourRate: 85,
}

function submit(s = createSeed()) {
  return transition(s, payload, 'technician', '2026-10-05T05:00:00Z')
}

function repairAndInspect(): FleetState {
  let s = submit()
  s = transition(s, { type: 'approve', id: 'WO-0042' }, 'reviewer', '2026-10-05T05:10:00Z')
  s = transition(
    s,
    {
      type: 'schedule',
      vehicleId: 'BUS 017',
      date: '2026-10-05',
      time: '11:00',
      inspectionType: 'reinspection',
      assignee: 'Jamie Chen',
    },
    'manager',
    '2026-10-05T05:15:00Z',
  )
  return transition(
    s,
    { type: 'inspect', id: 'IN-0106', checks: passed, note: 'Post-repair safety check passed.' },
    'inspector',
    '2026-10-05T05:20:00Z',
  )
}

test('repair → review → reinspection → release enforces separate approvals', () => {
  let s = submit()
  assert.equal(s.orders.find((o) => o.id === 'WO-0042')?.status, 'review')
  assert.equal(s.vehicles.find((v) => v.id === 'BUS 017')?.status, 'maintenance')
  s = transition(s, { type: 'approve', id: 'WO-0042' }, 'reviewer', '2026-10-05T05:10:00Z')
  assert.equal(s.defects.find((d) => d.id === 'DF-0021')?.status, 'resolved')
  assert.equal(releaseChecks(s, 'BUS 017').inspection, false)
  s = repairAndInspect()
  assert.equal(s.vehicles.find((v) => v.id === 'BUS 017')?.status, 'awaitingRelease')
  assert.equal(releaseChecks(s, 'BUS 017').ready, true)
  s = transition(s, { type: 'release', vehicleId: 'BUS 017' }, 'reviewer')
  assert.equal(s.vehicles.find((v) => v.id === 'BUS 017')?.status, 'available')
  assert.throws(
    () => transition(s, { type: 'release', vehicleId: 'BUS 017' }, 'reviewer'),
    FleetError,
  )
})

test('only linked defects are resolved when a repair is approved', () => {
  let s = transition(
    createSeed(),
    { type: 'defect', vehicleId: 'BUS 017', description: 'New tyre failure', severity: 'critical' },
    'inspector',
  )
  s = transition(submit(s), { type: 'approve', id: 'WO-0042' }, 'reviewer')
  assert.equal(s.defects.find((d) => d.id === 'DF-0024')?.status, 'open')
  assert.equal(releaseChecks(s, 'BUS 017').defects, false)
})

test('stock is issued once and amendments change only the delta', () => {
  let s = submit()
  assert.equal(s.parts[0].stock, 16)
  s = transition(s, { type: 'reject', id: 'WO-0042', reason: 'Add test results' }, 'reviewer')
  s = transition(s, payload, 'technician')
  assert.equal(s.parts[0].stock, 16)
  s = transition(s, { type: 'reject', id: 'WO-0042', reason: 'Correct quantities' }, 'reviewer')
  s = transition(
    s,
    { ...payload, parts: [{ partId: 'PT-0001', quantity: 3, price: 150 }] },
    'technician',
  )
  assert.equal(s.parts[0].stock, 15)
  s = transition(s, { type: 'reject', id: 'WO-0042', reason: 'Remove unused part' }, 'reviewer')
  s = transition(s, { ...payload, parts: [] }, 'technician')
  assert.equal(s.parts[0].stock, 18)
})

test('insufficient stock and invalid labour are atomic failures', () => {
  const s = createSeed()
  assert.throws(
    () =>
      transition(
        s,
        { ...payload, parts: [{ partId: 'PT-0001', quantity: 19, price: 150 }] },
        'technician',
      ),
    FleetError,
  )
  assert.equal(s.parts[0].stock, 18)
  assert.equal(s.orders[0].status, 'progress')
  assert.throws(() => transition(s, { ...payload, labourHours: 0 }, 'technician'), FleetError)
  assert.throws(
    () =>
      transition(
        s,
        { ...payload, parts: [{ partId: 'PT-0001', quantity: 1.5, price: 150 }] },
        'technician',
      ),
    FleetError,
  )
})

test('role and assignment boundaries cannot be bypassed', () => {
  const s = createSeed()
  assert.throws(() => transition(s, payload, 'manager'), FleetError)
  assert.throws(
    () => transition(submit(), { type: 'approve', id: 'WO-0042' }, 'technician'),
    FleetError,
  )
  const reassigned = transition(
    s,
    { type: 'assign', id: 'WO-0042', assignee: 'Casey Wilson' },
    'manager',
  )
  assert.throws(() => transition(reassigned, payload, 'technician'), FleetError)
  assert.throws(
    () => transition(s, { type: 'release', vehicleId: 'BUS 023' }, 'reviewer'),
    FleetError,
  )
})

test('failed inspection creates traceable faults and blocks release', () => {
  const checks = passed.map((c) =>
    c.key === 'tyres' ? { ...c, result: 'fail' as const, note: 'Rear tyre damaged' } : c,
  )
  const s = transition(
    createSeed(),
    { type: 'inspect', id: 'IN-0102', checks, note: 'Needs repair' },
    'inspector',
  )
  assert.equal(s.inspections[1].status, 'failed')
  assert.equal(s.vehicles[0].status, 'grounded')
  assert.equal(s.defects.at(-1)?.inspectionId, 'IN-0102')
  assert.equal(s.defects.at(-1)?.severity, 'critical')
  assert.equal(releaseChecks(s, 'BUS 008').ready, false)
  assert.throws(
    () =>
      transition(
        createSeed(),
        {
          type: 'inspect',
          id: 'IN-0102',
          checks: checks.map((c) => ({ ...c, note: '' })),
          note: '',
        },
        'inspector',
      ),
    FleetError,
  )
})

test('new work orders cannot be duplicated and must be assigned before repair', () => {
  let s = transition(createSeed(), { type: 'createOrder', defectId: 'DF-0022' }, 'manager')
  assert.equal(s.defects[1].orderId, 'WO-0045')
  assert.throws(
    () => transition(s, { type: 'createOrder', defectId: 'DF-0022' }, 'manager'),
    FleetError,
  )
  assert.throws(() => transition(s, { type: 'start', id: 'WO-0045' }, 'technician'), FleetError)
  s = transition(s, { type: 'assign', id: 'WO-0045', assignee: 'Sam Taylor' }, 'manager')
  s = transition(s, { type: 'start', id: 'WO-0045' }, 'technician')
  assert.equal(s.orders.at(-1)?.status, 'progress')
})

test('scheduling prevents duplicate vehicle bookings and inspector time conflicts', () => {
  const s = createSeed(),
    a = {
      type: 'schedule' as const,
      vehicleId: 'BUS 017',
      date: '2026-10-05',
      time: '10:00',
      inspectionType: 'reinspection' as const,
      assignee: 'Jamie Chen',
    }
  assert.throws(() => transition(s, a, 'manager'), FleetError)
  const booked = transition(s, { ...a, time: '09:00' }, 'manager')
  assert.equal(booked.inspections.at(-1)?.time, '09:00')
  assert.throws(() => transition(booked, { ...a, time: '11:00' }, 'manager'), FleetError)
  assert.throws(() => transition(s, { ...a, date: '2026-10-04' }, 'manager'), FleetError)
})

test('maintenance evaluates time, mileage and engine-hour triggers and rolls forward after approval', () => {
  let s = createSeed()
  assert.equal(planStatus(s.plans[2], s), 'overdue')
  assert.equal(planStatus(s.plans[3], s), 'scheduled')
  assert.equal(inspectionStatus(s.inspections[0]), 'overdue')
  s = transition(s, { type: 'assign', id: 'WO-0044', assignee: 'Sam Taylor' }, 'manager')
  s = transition(s, { type: 'start', id: 'WO-0044' }, 'technician')
  s = transition(s, { ...payload, id: 'WO-0044', parts: [] }, 'technician')
  s = transition(s, { type: 'approve', id: 'WO-0044' }, 'reviewer')
  assert.equal(s.plans[2].orderId, undefined)
  assert.equal(s.plans[2].dueMileage, 309610)
  assert.equal(s.plans[2].dueHours, 8710)
  assert.equal(planStatus(s.plans[2], s), 'scheduled')
})

test('seed release is valid and labour-only repairs have correct totals', () => {
  assert.equal(releaseChecks(createSeed(), 'BUS 041').ready, true)
  assert.equal(totalCost(payload), 470)
  assert.equal(totalCost({ ...payload, parts: [] }), 170)
  const s = transition(createSeed(), { type: 'release', vehicleId: 'BUS 041' }, 'reviewer')
  assert.equal(s.audit[0].actor, 'Jordan Lee')
  assert.equal(s.audit[0].entityId, 'BUS 041')
})

test('contractor portal: only the assigned contractor can submit, invoice reference is required', () => {
  let s = createSeed()
  assert.throws(() => transition(s, { type: 'start', id: 'WO-0043' }, 'technician'), FleetError)
  assert.throws(() => transition(s, { type: 'start', id: 'WO-0042' }, 'contractor'), FleetError)
  s = transition(s, { type: 'start', id: 'WO-0043' }, 'contractor')
  const job = { ...payload, id: 'WO-0043', parts: [], labourRate: 110 }
  assert.throws(() => transition(s, job, 'contractor'), FleetError)
  s = transition(s, { ...job, invoiceRef: 'INV-7781' }, 'contractor')
  assert.equal(s.orders.find((o) => o.id === 'WO-0043')?.status, 'review')
  assert.equal(s.audit[0].actor, 'Coastline Diesel')
  assert.throws(() => transition(s, { type: 'approve', id: 'WO-0043' }, 'contractor'), FleetError)
  assert.throws(
    () => transition(s, { type: 'release', vehicleId: 'BUS 052' }, 'contractor'),
    FleetError,
  )
})

test('vehicle register blocks duplicates, new vehicles need a first inspection, records can be deactivated', () => {
  const input = {
    id: 'bus 110',
    plate: 'hrt110',
    model: 'Volvo B8R',
    vehicleClass: 'bus' as const,
    year: 2026,
    depot: 'Wollongong',
    vin: 'HRTDEMO00000000110',
    mileage: 0,
    hours: 0,
  }
  let s = transition(createSeed(), { type: 'saveVehicle', isNew: true, vehicle: input }, 'manager')
  const v = s.vehicles.at(-1)!
  assert.equal(v.id, 'BUS 110')
  assert.equal(v.status, 'grounded')
  assert.equal(releaseChecks(s, 'BUS 110').ready, false)
  assert.throws(
    () => transition(s, { type: 'saveVehicle', isNew: true, vehicle: input }, 'manager'),
    FleetError,
  )
  assert.throws(
    () =>
      transition(
        s,
        { type: 'saveVehicle', isNew: true, vehicle: { ...input, id: 'BUS 111', plate: 'HRT008' } },
        'manager',
      ),
    FleetError,
  )
  assert.throws(
    () =>
      transition(
        s,
        { type: 'saveVehicle', isNew: false, vehicle: { ...input, id: 'BUS 008', mileage: 10 } },
        'manager',
      ),
    FleetError,
  )
  assert.throws(
    () => transition(s, { type: 'saveVehicle', isNew: true, vehicle: input }, 'inspector'),
    FleetError,
  )
  assert.throws(
    () => transition(s, { type: 'deactivateVehicle', vehicleId: 'BUS 017' }, 'manager'),
    FleetError,
  )
  s = transition(s, { type: 'deactivateVehicle', vehicleId: 'BUS 089' }, 'manager')
  assert.equal(s.vehicles.find((x) => x.id === 'BUS 089')?.active, false)
  assert.throws(
    () =>
      transition(
        s,
        { type: 'defect', vehicleId: 'BUS 089', severity: 'minor', description: 'Test' },
        'inspector',
      ),
    FleetError,
  )
})

test('telemetry sync updates readings and finance posting happens once per closed order', () => {
  let s = transition(createSeed(), { type: 'syncTelemetry', vehicleId: 'BUS 008' }, 'manager')
  assert.equal(s.vehicles[0].mileage, 125000)
  assert.equal(s.vehicles[0].hours, 3826)
  s = transition(submit(s), { type: 'approve', id: 'WO-0042' }, 'reviewer')
  const o = () => s.orders.find((x) => x.id === 'WO-0042')!
  assert.equal(o().finance, 'financePending')
  assert.throws(() => transition(s, { type: 'postFinance', id: 'WO-0042' }, 'reviewer'), FleetError)
  s = transition(s, { type: 'postFinance', id: 'WO-0042' }, 'manager')
  assert.equal(o().finance, 'financePosted')
  assert.equal(o().financeRef, 'FIN-2026-0419')
  assert.throws(() => transition(s, { type: 'postFinance', id: 'WO-0042' }, 'manager'), FleetError)
})

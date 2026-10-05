import {
  bilingual as b,
  entered,
  DEMO_DATE,
  users,
  staff,
  contractors,
  depots,
  vehicleClasses,
  checkKeys,
  type FleetState,
  type Role,
  type Check,
  type PartLine,
  type MaintenancePlan,
  type WorkOrder,
  type VehicleClass,
} from './model'

export class FleetError extends Error {
  constructor(
    public en: string,
    public zh: string,
  ) {
    super(en)
  }
}

function fail(en: string, zh: string): never {
  throw new FleetError(en, zh)
}

function requireRole(role: Role, allowed: Role[]) {
  if (!allowed.includes(role))
    fail('This action is not available for your current role.', '当前角色无权执行此操作。')
}

export function nextId(prefix: string, records: { id: string }[]) {
  return `${prefix}-${String(Math.max(0, ...records.map((r) => Number(r.id.split('-')[1]))) + 1).padStart(4, '0')}`
}

export function inspectionStatus(i: FleetState['inspections'][number]) {
  return i.status === 'pending' && i.date < DEMO_DATE ? 'overdue' : i.status
}

// 14 天、3000 公里或 200 小时以内算快到期
export function planStatus(
  plan: MaintenancePlan,
  state: FleetState,
): 'overdue' | 'dueSoon' | 'scheduled' {
  const v = state.vehicles.find((v) => v.id === plan.vehicleId)!
  if (plan.dueDate < DEMO_DATE || v.mileage >= plan.dueMileage || v.hours >= plan.dueHours)
    return 'overdue'
  if (
    plan.dueDate <= addDays(DEMO_DATE, 14) ||
    plan.dueMileage - v.mileage <= 3000 ||
    plan.dueHours - v.hours <= 200
  )
    return 'dueSoon'
  return 'scheduled'
}

function addDays(date: string, days: number) {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// 放行条件：最后一次维修之后有通过的检查，没有严重故障，工单全部关闭
export function releaseChecks(state: FleetState, vehicleId: string) {
  const completed = state.inspections
    .filter((i) => i.vehicleId === vehicleId && i.status !== 'pending')
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
  const lastRepair =
    state.orders
      .filter((o) => o.vehicleId === vehicleId && o.closedAt)
      .map((o) => o.closedAt!)
      .sort()
      .at(-1) || ''
  const pending = state.inspections.some(
    (i) => i.vehicleId === vehicleId && i.status === 'pending' && i.date <= DEMO_DATE,
  )
  const inspection =
    !!completed[0] &&
    completed[0].status === 'passed' &&
    (completed[0].completedAt || '') >= lastRepair &&
    !pending
  const defects = !state.defects.some(
    (d) => d.vehicleId === vehicleId && d.severity === 'critical' && d.status !== 'resolved',
  )
  const orders = !state.orders.some((o) => o.vehicleId === vehicleId && o.status !== 'closed')
  return { inspection, defects, orders, ready: inspection && defects && orders }
}

export function totalCost(order: Pick<WorkOrder, 'parts' | 'labourHours' | 'labourRate'>) {
  return (
    order.parts.reduce((n, p) => n + p.price * p.quantity, 0) + order.labourHours * order.labourRate
  )
}

export function costCode(order: Pick<WorkOrder, 'assignee' | 'planId'>) {
  if (contractors.includes(order.assignee)) return 'MNT-CONTRACT'
  return order.planId ? 'MNT-PLANNED' : 'MNT-CORRECTIVE'
}

export interface VehicleInput {
  id: string
  plate: string
  model: string
  vehicleClass: VehicleClass
  year: number
  depot: string
  vin: string
  mileage: number
  hours: number
}

function reconcile(state: FleetState, vehicleId: string) {
  const v = state.vehicles.find((v) => v.id === vehicleId)!
  const checks = releaseChecks(state, vehicleId)
  if (v.status !== 'available' && checks.ready) v.status = 'awaitingRelease'
  else if (v.status !== 'available')
    v.status = state.orders.some(
      (o) => o.vehicleId === vehicleId && ['progress', 'review', 'returned'].includes(o.status),
    )
      ? 'maintenance'
      : 'grounded'
}

export type Action =
  | {
      type: 'schedule'
      vehicleId: string
      date: string
      inspectionType: 'routine' | 'reinspection'
      assignee: string
      time: string
    }
  | { type: 'inspect'; id: string; checks: Check[]; note: string }
  | { type: 'defect'; vehicleId: string; severity: 'minor' | 'critical'; description: string }
  | { type: 'createOrder'; defectId?: string; planId?: string }
  | { type: 'assign'; id: string; assignee: string }
  | { type: 'start'; id: string }
  | {
      type: 'submit'
      id: string
      note: string
      parts: PartLine[]
      labourHours: number
      labourRate: number
      invoiceRef?: string
    }
  | { type: 'approve'; id: string }
  | { type: 'reject'; id: string; reason: string }
  | { type: 'release'; vehicleId: string }
  | { type: 'restock'; id: string; quantity: number }
  | { type: 'saveVehicle'; isNew: boolean; vehicle: VehicleInput }
  | { type: 'deactivateVehicle'; vehicleId: string }
  | { type: 'syncTelemetry'; vehicleId: string }
  | { type: 'postFinance'; id: string }

// 所有操作都走这里，出错抛 FleetError，原来的 state 不会被改
export function transition(
  original: FleetState,
  action: Action,
  role: Role,
  at = new Date().toISOString(),
): FleetState {
  const state: FleetState = structuredClone(original)
  let vehicleId: string | undefined,
    entityId = '',
    message = b('', '')
  const vehicle = (id: string) =>
    state.vehicles.find((v) => v.id === id) || fail('Vehicle not found.', '找不到车辆。')
  const order = (id: string) =>
    state.orders.find((o) => o.id === id) || fail('Work order not found.', '找不到工单。')
  const activeVehicle = (id: string) => {
    const v = vehicle(id)
    if (!v.active) fail('This vehicle record is deactivated.', '该车辆档案已停用。')
    return v
  }
  const technician = (o: WorkOrder) => {
    requireRole(role, ['technician', 'contractor'])
    if (o.assignee !== users[role])
      fail('You can only work on orders assigned to you.', '只能处理分配给自己的工单。')
  }

  switch (action.type) {
    case 'schedule': {
      requireRole(role, ['manager'])
      vehicleId = action.vehicleId
      activeVehicle(vehicleId)
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(action.date) ||
        action.date < DEMO_DATE ||
        !['Jamie Chen', 'Robin Park'].includes(action.assignee)
      )
        fail(
          'Choose a date on or after the demo date and an inspector.',
          '请选择不早于演示日期的检查日期及检查员。',
        )
      if (
        state.inspections.some(
          (i) => i.vehicleId === vehicleId && i.date === action.date && i.status === 'pending',
        )
      )
        fail('This vehicle already has an inspection on this date.', '这辆车在该日期已有检查安排。')
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(action.time))
        fail('Enter a valid inspection time.', '请输入有效的检查时间。')
      if (
        state.inspections.some(
          (i) =>
            i.date === action.date &&
            i.time === action.time &&
            i.assignee === action.assignee &&
            i.status === 'pending',
        )
      )
        fail(
          'This inspector is already booked at this time. Choose another time or inspector.',
          '检查员此时已有任务，请选择其他时间或检查员。',
        )
      entityId = nextId('IN', state.inspections)
      state.inspections.push({
        id: entityId,
        vehicleId,
        date: action.date,
        time: action.time,
        type: action.inspectionType,
        assignee: action.assignee,
        status: 'pending',
        checks: [],
        note: b('', ''),
      })
      message = b('Inspection scheduled', '已安排检查')
      break
    }

    // 不通过的项目自动生成故障，刹车、轮胎、车门算严重
    case 'inspect': {
      requireRole(role, ['inspector'])
      const i =
        state.inspections.find((i) => i.id === action.id) ||
        fail('Inspection not found.', '找不到检查任务。')
      vehicleId = i.vehicleId
      entityId = i.id
      if (i.status !== 'pending' || i.assignee !== users.inspector)
        fail('Only your pending inspections can be completed.', '只能完成分配给自己的待检查任务。')
      if (i.date > DEMO_DATE)
        fail('This inspection is scheduled for a future demo date.', '该检查尚未到演示日期。')
      if (
        action.checks.length !== checkKeys.length ||
        !checkKeys.every((key) =>
          action.checks.some((c) => c.key === key && ['pass', 'fail'].includes(c.result)),
        )
      )
        fail('Complete every inspection item.', '请完成全部检查项目。')
      if (action.checks.some((c) => c.result === 'fail' && !c.note.trim()))
        fail('Add a reason for every failed item.', '请为每个未通过项目填写原因。')
      i.checks = action.checks
      i.note = entered(action.note)
      i.completedAt = at
      i.status = action.checks.some((c) => c.result === 'fail') ? 'failed' : 'passed'
      for (const c of action.checks.filter((c) => c.result === 'fail')) {
        const critical = ['brakes', 'tyres', 'doors'].includes(c.key)
        state.defects.push({
          id: nextId('DF', state.defects),
          vehicleId,
          description: entered(c.note),
          severity: critical ? 'critical' : 'minor',
          status: 'open',
          date: DEMO_DATE,
          inspectionId: i.id,
        })
        if (critical) vehicle(vehicleId).status = 'grounded'
      }
      if (i.status === 'failed') vehicle(vehicleId).status = 'grounded'
      reconcile(state, vehicleId)
      message =
        i.status === 'passed'
          ? b('Inspection passed', '检查通过')
          : b('Inspection failed; linked defects created', '检查未通过，已创建关联故障')
      break
    }

    case 'defect': {
      requireRole(role, ['inspector'])
      vehicleId = action.vehicleId
      const v = activeVehicle(vehicleId)
      if (!action.description.trim()) fail('Describe the defect.', '请填写故障描述。')
      entityId = nextId('DF', state.defects)
      state.defects.push({
        id: entityId,
        vehicleId,
        description: entered(action.description.trim()),
        severity: action.severity,
        status: 'open',
        date: DEMO_DATE,
      })
      if (action.severity === 'critical') v.status = 'grounded'
      message = b('Defect recorded', '已记录故障')
      break
    }

    case 'createOrder': {
      requireRole(role, ['manager'])
      const d = state.defects.find((d) => d.id === action.defectId)
      const p = state.plans.find((p) => p.id === action.planId)
      if (!d && !p) fail('Select a defect or maintenance plan.', '请选择故障或保养计划。')
      if ((d && (d.orderId || d.status === 'resolved')) || p?.orderId)
        fail('A work order already exists for this record.', '该记录已有工单。')
      vehicleId = d?.vehicleId || p!.vehicleId
      activeVehicle(vehicleId)
      entityId = nextId('WO', state.orders)
      state.orders.push({
        id: entityId,
        vehicleId,
        title: d?.description || p!.title,
        defectIds: d ? [d.id] : [],
        planId: p?.id,
        assignee: '',
        status: 'pending',
        date: DEMO_DATE,
        note: b('', ''),
        parts: [],
        issued: {},
        labourHours: 0,
        labourRate: 85,
      })
      if (d) {
        d.orderId = entityId
        d.status = 'processing'
      }
      if (p) p.orderId = entityId
      if (vehicle(vehicleId).status === 'awaitingRelease') vehicle(vehicleId).status = 'grounded'
      message = b('Linked work order created', '已创建关联工单')
      break
    }

    case 'assign': {
      requireRole(role, ['manager'])
      const o = order(action.id)
      vehicleId = o.vehicleId
      entityId = o.id
      if (
        ['review', 'closed'].includes(o.status) ||
        ![...staff, ...contractors].includes(action.assignee)
      )
        fail(
          'Choose a valid technician or contractor for an editable order.',
          '请选择有效的维修技师或承包商，工单必须可编辑。',
        )
      o.assignee = action.assignee
      if (o.status === 'pending') o.status = 'assigned'
      message = contractors.includes(action.assignee)
        ? b('Work order sent to contractor portal', '工单已发送到承包商门户')
        : b('Technician assigned', '已分配维修技师')
      break
    }

    case 'start': {
      const o = order(action.id)
      technician(o)
      vehicleId = o.vehicleId
      entityId = o.id
      if (o.status !== 'assigned')
        fail('Only assigned orders can be started.', '只有已分配的工单可以开始维修。')
      o.status = 'progress'
      vehicle(vehicleId).status = 'maintenance'
      message = b('Repair started', '已开始维修')
      break
    }

    case 'submit': {
      const o = order(action.id)
      technician(o)
      vehicleId = o.vehicleId
      entityId = o.id
      if (!['progress', 'returned'].includes(o.status))
        fail('Start the repair before submitting it.', '请先开始维修后再提交。')
      if (
        !action.note.trim() ||
        !Number.isFinite(action.labourHours) ||
        action.labourHours <= 0 ||
        !Number.isFinite(action.labourRate) ||
        action.labourRate < 0
      )
        fail(
          'Enter repair notes, positive labour hours and a valid rate.',
          '请填写维修内容、正数工时和有效时薪。',
        )
      if (role === 'contractor' && !action.invoiceRef?.trim())
        fail('Contractors must enter an invoice reference.', '承包商提交时必须填写发票号。')
      const quantities: Record<string, number> = {}
      for (const line of action.parts) {
        if (
          !state.parts.some((p) => p.id === line.partId) ||
          !Number.isInteger(line.quantity) ||
          line.quantity < 1 ||
          !Number.isFinite(line.price) ||
          line.price < 0
        )
          fail(
            'Each part needs a valid item, whole quantity and non-negative price.',
            '零件需有效，数量为正整数且单价不小于零。',
          )
        quantities[line.partId] = (quantities[line.partId] || 0) + line.quantity
      }
      // 只扣和上次的差额，退回后再提交不会重复扣库存
      for (const p of state.parts) {
        const delta = (quantities[p.id] || 0) - (o.issued[p.id] || 0)
        if (delta > p.stock) fail(`Insufficient stock: ${p.name.en}`, `库存不足：${p.name.zh}`)
        p.stock -= delta
      }
      o.issued = quantities
      o.parts = action.parts
      o.note = entered(action.note.trim())
      o.labourHours = action.labourHours
      o.labourRate = action.labourRate
      o.invoiceRef = action.invoiceRef?.trim() || undefined
      o.status = 'review'
      o.rejection = undefined
      message = b('Repair submitted; parts stock updated', '维修已提交，零件库存已更新')
      break
    }

    case 'approve': {
      requireRole(role, ['reviewer'])
      const o = order(action.id)
      vehicleId = o.vehicleId
      entityId = o.id
      if (o.status !== 'review')
        fail('Only submitted repairs can be approved.', '只有待审核的维修记录可以审核。')
      o.status = 'closed'
      o.closedAt = at
      o.finance = 'financePending'
      for (const id of o.defectIds) {
        const d = state.defects.find((d) => d.id === id)
        if (d && d.orderId === o.id) d.status = 'resolved'
      }
      const p = state.plans.find((p) => p.id === o.planId)
      if (p) {
        const v = vehicle(vehicleId)
        p.dueDate = addDays(DEMO_DATE, p.intervalDays)
        p.dueMileage = v.mileage + p.intervalMileage
        p.dueHours = v.hours + p.intervalHours
        p.orderId = undefined
      }
      reconcile(state, vehicleId)
      message = b('Repair approved; work order closed', '维修审核通过，工单已关闭')
      break
    }

    case 'reject': {
      requireRole(role, ['reviewer'])
      const o = order(action.id)
      vehicleId = o.vehicleId
      entityId = o.id
      if (o.status !== 'review' || !action.reason.trim())
        fail('A pending review and return reason are required.', '需要待审核工单及退回原因。')
      o.status = 'returned'
      o.rejection = entered(action.reason.trim())
      message = b('Repair returned for amendment', '维修记录已退回修改')
      break
    }

    case 'release': {
      requireRole(role, ['reviewer'])
      vehicleId = action.vehicleId
      const v = vehicle(vehicleId)
      entityId = v.id
      if (v.status !== 'awaitingRelease' || !releaseChecks(state, v.id).ready)
        fail('Release is blocked until all safety checks pass.', '所有放行条件满足后才能确认放行。')
      v.status = 'available'
      message = b('Vehicle released for service', '车辆已确认放行，可恢复运营')
      break
    }

    case 'restock': {
      requireRole(role, ['manager'])
      const p =
        state.parts.find((p) => p.id === action.id) || fail('Part not found.', '找不到零件。')
      if (!Number.isInteger(action.quantity) || action.quantity < 1)
        fail('Enter a positive whole quantity.', '请输入正整数数量。')
      p.stock += action.quantity
      entityId = p.id
      message = b(`Stock received: ${action.quantity} units`, `已补充库存：${action.quantity} 件`)
      break
    }

    case 'saveVehicle': {
      requireRole(role, ['manager'])
      const input = action.vehicle
      const id = input.id.trim().toUpperCase(),
        plate = input.plate.trim().toUpperCase(),
        vin = input.vin.trim().toUpperCase()
      if (
        !id ||
        !plate ||
        !vin ||
        !input.model.trim() ||
        !depots.includes(input.depot) ||
        !vehicleClasses.includes(input.vehicleClass)
      )
        fail('Complete every required vehicle field.', '请填写车辆档案的全部必填项。')
      if (!Number.isInteger(input.year) || input.year < 1990 || input.year > 2027)
        fail('Enter a model year between 1990 and 2027.', '出厂年份需在 1990 至 2027 之间。')
      if (
        !Number.isFinite(input.mileage) ||
        !Number.isFinite(input.hours) ||
        input.mileage < 0 ||
        input.hours < 0
      )
        fail('Readings cannot be negative.', '里程和发动机小时不能为负数。')
      const others = state.vehicles.filter((v) => action.isNew || v.id !== id)
      if (others.some((v) => v.id.toUpperCase() === id))
        fail('This fleet number already exists.', '车辆编号已存在。')
      if (others.some((v) => v.plate.toUpperCase() === plate))
        fail('This registration already exists.', '车牌号已存在。')
      if (others.some((v) => v.vin.toUpperCase() === vin))
        fail('This VIN already exists.', '车架号已存在。')
      const fields = {
        plate,
        vin,
        model: input.model.trim(),
        vehicleClass: input.vehicleClass,
        year: input.year,
        depot: input.depot,
        mileage: input.mileage,
        hours: input.hours,
      }
      if (action.isNew) {
        // 新车要先过一次检查才能放行
        state.vehicles.push({
          id,
          ...fields,
          status: 'grounded',
          active: true,
          telemetryAt: at,
        })
        message = b('Vehicle registered; first inspection required', '车辆已入册，需完成首次检查')
      } else {
        const v = activeVehicle(id)
        if (fields.mileage < v.mileage || fields.hours < v.hours)
          fail(
            'Mileage and engine hours cannot be lower than the current readings.',
            '里程和发动机小时不能低于当前读数。',
          )
        Object.assign(v, fields)
        message = b('Vehicle record updated', '车辆档案已更新')
      }
      vehicleId = entityId = id
      break
    }

    case 'deactivateVehicle': {
      requireRole(role, ['manager'])
      vehicleId = entityId = action.vehicleId
      const v = activeVehicle(vehicleId)
      if (
        state.orders.some((o) => o.vehicleId === v.id && o.status !== 'closed') ||
        state.inspections.some((i) => i.vehicleId === v.id && i.status === 'pending')
      )
        fail(
          'Close open work orders and pending inspections first.',
          '请先关闭该车辆的未完成工单和待检查任务。',
        )
      v.active = false
      message = b('Vehicle record deactivated', '车辆档案已停用')
      break
    }

    // 模拟遥测，每次加 180 公里、6 小时
    case 'syncTelemetry': {
      requireRole(role, ['manager'])
      vehicleId = entityId = action.vehicleId
      const v = activeVehicle(vehicleId)
      v.mileage += 180
      v.hours += 6
      v.telemetryAt = at
      message = b(
        `Telemetry synced: ${v.mileage} km, ${v.hours} h`,
        `遥测已同步：${v.mileage} 公里，${v.hours} 小时`,
      )
      break
    }

    case 'postFinance': {
      requireRole(role, ['manager'])
      const o = order(action.id)
      vehicleId = o.vehicleId
      entityId = o.id
      if (o.status !== 'closed' || o.finance !== 'financePending')
        fail(
          'Only closed work orders awaiting posting can be posted.',
          '只有已关闭且待过账的工单可以过账。',
        )
      const posted = state.orders.filter((x) => x.financeRef).length
      o.finance = 'financePosted'
      o.financeRef = `FIN-2026-${String(418 + posted).padStart(4, '0')}`
      message = b(
        `Cost posted to finance: ${o.financeRef}`,
        `费用已过账到财务系统：${o.financeRef}`,
      )
      break
    }
  }

  state.audit.unshift({
    id: nextId('EV', state.audit),
    at,
    actor: users[role],
    role,
    entityId,
    vehicleId,
    message,
  })
  return state
}

export type Language = 'en' | 'zh';

export type Text = { en: string; zh: string };

export type Role =
  'manager' | 'inspector' | 'technician' | 'reviewer' | 'contractor';

export type VehicleStatus =
  'available' | 'maintenance' | 'grounded' | 'awaitingRelease';

export type VehicleClass = 'bus' | 'community';

// 工单流程 pending -> assigned -> progress -> review -> closed，被退回是 returned
export type WorkStatus =
  'pending' | 'assigned' | 'progress' | 'review' | 'returned' | 'closed';

export type InspectionStatus = 'pending' | 'passed' | 'failed';

export type DefectStatus = 'open' | 'processing' | 'resolved';

export type FinanceStatus = 'financePending' | 'financePosted';

export type Page =
  | 'dashboard'
  | 'inspections'
  | 'defects'
  | 'orders'
  | 'vehicles'
  | 'maintenance'
  | 'parts';

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  vehicleClass: VehicleClass;
  year: number;
  depot: string;
  mileage: number;
  hours: number;
  status: VehicleStatus;
  vin: string;
  active: boolean;
  telemetryAt: string;
}

export interface Check {
  key: string;
  result: 'pass' | 'fail';
  note: string;
}

export interface Inspection {
  id: string;
  vehicleId: string;
  date: string;
  time?: string;
  type: 'routine' | 'reinspection';
  assignee: string;
  status: InspectionStatus;
  checks: Check[];
  note: Text;
  completedAt?: string;
}

export interface Defect {
  id: string;
  vehicleId: string;
  description: Text;
  severity: 'minor' | 'critical';
  status: DefectStatus;
  date: string;
  inspectionId?: string;
  orderId?: string;
}

export interface Part {
  id: string;
  name: Text;
  sku: string;
  stock: number;
  minStock: number;
  price: number;
  category: Text;
}

export interface PartLine {
  partId: string;
  quantity: number;
  price: number;
}

export interface WorkOrder {
  id: string;
  vehicleId: string;
  title: Text;
  defectIds: string[];
  planId?: string;
  assignee: string;
  status: WorkStatus;
  date: string;
  note: Text;
  parts: PartLine[];
  issued: Record<string, number>;
  labourHours: number;
  labourRate: number;
  invoiceRef?: string;
  rejection?: Text;
  closedAt?: string;
  finance?: FinanceStatus;
  financeRef?: string;
}

export interface MaintenancePlan {
  id: string;
  vehicleId: string;
  title: Text;
  dueDate: string;
  dueMileage: number;
  dueHours: number;
  intervalDays: number;
  intervalMileage: number;
  intervalHours: number;
  orderId?: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  role: Role;
  entityId: string;
  vehicleId?: string;
  message: Text;
}

// 改了数据结构记得把 version 加一，旧数据会被重置
export interface FleetState {
  version: 2;
  vehicles: Vehicle[];
  inspections: Inspection[];
  defects: Defect[];
  orders: WorkOrder[];
  parts: Part[];
  plans: MaintenancePlan[];
  audit: AuditEvent[];
}

// 演示用的固定日期
export const DEMO_DATE = '2026-10-05';

export const users: Record<Role, string> = {
  manager: 'Alex Morgan',
  inspector: 'Jamie Chen',
  technician: 'Sam Taylor',
  reviewer: 'Jordan Lee',
  contractor: 'Coastline Diesel',
};

export const staff = ['Sam Taylor', 'Casey Wilson'];

export const contractors = ['Coastline Diesel'];

export const depots = ['Wollongong', 'Shellharbour'];

export const vehicleClasses: VehicleClass[] = ['bus', 'community'];

export const roles: Role[] = [
  'manager',
  'inspector',
  'technician',
  'reviewer',
  'contractor',
];

export const bilingual = (en: string, zh: string): Text => ({ en, zh });

export const entered = (value: string): Text => ({ en: value, zh: value });

export const checkKeys = ['brakes', 'tyres', 'lights', 'doors', 'fluids'];

// Fixed roles and their permissions. Company admins assign roles; nobody edits these definitions at runtime.
// Every server action and API route checks a permission from here (see lib/tenancy.ts), never the UI alone.

export const PERMISSIONS = {
  'org.manage': 'Edit company details, seat policy and discounts',
  'users.manage': 'Create company users and assign roles',
  'fleet.view': 'See buses and seat layouts',
  'fleet.manage': 'Register buses, amenities and seat layouts',
  'fleet.maintain': 'Set bus maintenance status',
  'routes.manage': 'Create routes, stops, fares and itineraries',
  'schedules.manage': 'Create schedules and adjust fares',
  'trips.view': 'See all company trips',
  'trips.view_assigned': 'See trips you are assigned to',
  'trips.dispatch': 'Assign buses and crew, change trip status',
  'bookings.view': 'See bookings and manifests',
  'bookings.sell': 'Sell tickets at the terminal',
  'bookings.refund': 'Mark bookings refunded',
  'bookings.checkin': 'Check passengers in at boarding',
  'payments.view': 'See payments and reconciliation',
  'reports.view': 'See revenue and operations reports',
  'audit.view': 'Read the company audit log',
} as const;
export type Permission = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as Permission[];
const READ_ONLY: Permission[] = ['fleet.view', 'trips.view', 'bookings.view', 'payments.view', 'reports.view', 'audit.view'];

export const ROLES = {
  company_admin: { name: 'Company Administrator', perms: ALL },
  operations_manager: { name: 'Operations Manager', perms: ['fleet.view', 'routes.manage', 'schedules.manage', 'trips.view', 'trips.dispatch', 'bookings.view', 'reports.view'] },
  dispatcher: { name: 'Dispatcher', perms: ['fleet.view', 'trips.view', 'trips.dispatch', 'bookings.view'] },
  ticketing_officer: { name: 'Ticketing Officer', perms: ['trips.view', 'bookings.view', 'bookings.sell', 'bookings.checkin'] },
  cashier: { name: 'Cashier', perms: ['trips.view', 'bookings.view', 'bookings.sell', 'payments.view'] },
  driver: { name: 'Driver', perms: ['trips.view_assigned'] },
  assistant_driver: { name: 'Assistant Driver', perms: ['trips.view_assigned'] },
  conductor: { name: 'Conductor', perms: ['trips.view_assigned', 'bookings.checkin'] },
  baggage_handler: { name: 'Baggage Handler', perms: ['trips.view'] },
  fleet_manager: { name: 'Fleet Manager', perms: ['fleet.view', 'fleet.manage', 'fleet.maintain', 'trips.view'] },
  maintenance: { name: 'Maintenance Personnel', perms: ['fleet.view', 'fleet.maintain'] },
  finance_officer: { name: 'Finance Officer', perms: ['bookings.view', 'bookings.refund', 'payments.view', 'reports.view'] },
  customer_service: { name: 'Customer Service Representative', perms: ['trips.view', 'bookings.view', 'bookings.refund'] },
  auditor: { name: 'Auditor', perms: READ_ONLY },
} satisfies Record<string, { name: string; perms: Permission[] }>;
export type Role = keyof typeof ROLES;

export const isRole = (r: unknown): r is Role => typeof r === 'string' && r in ROLES;
export const can = (role: Role | null | undefined, p: Permission) => !!role && (ROLES[role].perms as Permission[]).includes(p);

/** Crew see a trip only when assigned; anyone with trips.view sees all company trips. */
export const canSeeTrip = (role: Role, userId: string, trip: { driver_id: string | null; conductor_id: string | null }) =>
  can(role, 'trips.view') || (can(role, 'trips.view_assigned') && (trip.driver_id === userId || trip.conductor_id === userId));

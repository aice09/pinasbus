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
  'baggage.manage': 'Register, tag, weigh, load and release baggage',
  'tracking.view': 'Watch live bus positions, speeds and alerts',
  'tracking.report': 'Send the bus position from a phone while on an assigned trip',
  'ferry.link': 'Book ferry connections for trips',
  'ships.manage': 'Manage vessels, ports and sailings',
  'ships.operate': 'Board, load and unload buses; update vessel status',
  'cards.manage': 'Manage card programs, cards and cardholders',
  'cards.view': 'See card balances, loads and reconciliation',
} as const;
export type Permission = keyof typeof PERMISSIONS;

const BUS: Permission[] = ['org.manage', 'users.manage', 'fleet.view', 'fleet.manage', 'fleet.maintain', 'routes.manage', 'schedules.manage', 'trips.view',
  'trips.view_assigned', 'trips.dispatch', 'bookings.view', 'bookings.sell', 'bookings.refund', 'bookings.checkin', 'payments.view', 'reports.view', 'audit.view',
  'baggage.manage', 'tracking.view', 'tracking.report', 'ferry.link'];
const READ_ONLY: Permission[] = ['fleet.view', 'trips.view', 'bookings.view', 'payments.view', 'reports.view', 'audit.view', 'tracking.view'];

export const ROLES = {
  company_admin: { name: 'Company Administrator', perms: BUS },
  operations_manager: { name: 'Operations Manager', perms: ['fleet.view', 'routes.manage', 'schedules.manage', 'trips.view', 'trips.dispatch', 'bookings.view', 'reports.view', 'tracking.view', 'ferry.link'] },
  dispatcher: { name: 'Dispatcher', perms: ['fleet.view', 'trips.view', 'trips.dispatch', 'bookings.view', 'tracking.view', 'ferry.link'] },
  ticketing_officer: { name: 'Ticketing Officer', perms: ['trips.view', 'bookings.view', 'bookings.sell', 'bookings.checkin', 'baggage.manage'] },
  cashier: { name: 'Cashier', perms: ['trips.view', 'bookings.view', 'bookings.sell', 'payments.view'] },
  driver: { name: 'Driver', perms: ['trips.view_assigned', 'tracking.report'] },
  assistant_driver: { name: 'Assistant Driver', perms: ['trips.view_assigned', 'tracking.report'] },
  conductor: { name: 'Conductor', perms: ['trips.view_assigned', 'bookings.checkin', 'baggage.manage', 'tracking.report'] },
  baggage_handler: { name: 'Baggage Handler', perms: ['trips.view', 'baggage.manage'] },
  fleet_manager: { name: 'Fleet Manager', perms: ['fleet.view', 'fleet.manage', 'fleet.maintain', 'trips.view', 'tracking.view'] },
  maintenance: { name: 'Maintenance Personnel', perms: ['fleet.view', 'fleet.maintain'] },
  finance_officer: { name: 'Finance Officer', perms: ['bookings.view', 'bookings.refund', 'payments.view', 'reports.view'] },
  customer_service: { name: 'Customer Service Representative', perms: ['trips.view', 'bookings.view', 'bookings.refund'] },
  auditor: { name: 'Auditor', perms: READ_ONLY },
  shipping_admin: { name: 'Shipping Administrator', perms: ['org.manage', 'users.manage', 'ships.manage', 'ships.operate', 'audit.view'] },
  vessel_operator: { name: 'Vessel Operator', perms: ['ships.operate'] },
  card_admin: { name: 'Card Administrator', perms: ['org.manage', 'users.manage', 'cards.manage', 'cards.view', 'audit.view'] },
  card_finance: { name: 'Card Finance Officer', perms: ['cards.view'] },
} satisfies Record<string, { name: string; perms: Permission[] }>;
export type Role = keyof typeof ROLES;

export const isRole = (r: unknown): r is Role => typeof r === 'string' && r in ROLES;

/** Which organization kind each role belongs to; a company can only hand out roles of its own kind. */
export const ROLE_KIND: Record<Role, 'bus_operator' | 'shipping_operator' | 'card_issuer'> = Object.fromEntries(
  (Object.keys(ROLES) as Role[]).map((r) => [r, r.startsWith('shipping_') || r === 'vessel_operator' ? 'shipping_operator' : r.startsWith('card_') ? 'card_issuer' : 'bus_operator']),
) as Record<Role, 'bus_operator' | 'shipping_operator' | 'card_issuer'>;
export const rolesFor = (kind: string) => (Object.keys(ROLES) as Role[]).filter((r) => ROLE_KIND[r] === kind);
export const adminRoleFor = (kind: string): Role => (kind === 'shipping_operator' ? 'shipping_admin' : kind === 'card_issuer' ? 'card_admin' : 'company_admin');
export const can = (role: Role | null | undefined, p: Permission) => !!role && (ROLES[role].perms as Permission[]).includes(p);

/** Crew see a trip only when assigned; anyone with trips.view sees all company trips. */
export const canSeeTrip = (role: Role, userId: string, trip: { driver_id: string | null; conductor_id: string | null }) =>
  can(role, 'trips.view') || (can(role, 'trips.view_assigned') && (trip.driver_id === userId || trip.conductor_id === userId));

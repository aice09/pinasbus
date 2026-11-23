import { q } from './db.ts';

export const orgNames = async () => Object.fromEntries((await q<{ id: string; name: string }>('select id, name from organizations')).map((o) => [o.id, o.name]));

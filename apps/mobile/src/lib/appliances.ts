export interface Appliance {
  id: string;
  name: string;
  icon: string;
  durationMinutes: number;
  /** Typical energy per run, kWh — used to turn price differences into savings. */
  kwh: number;
}

/** Typical values for a household; users will be able to edit these later. */
export const APPLIANCES: Appliance[] = [
  { id: 'washer', name: 'Pralka', icon: '🧺', durationMinutes: 120, kwh: 1.0 },
  { id: 'dishwasher', name: 'Zmywarka', icon: '🍽️', durationMinutes: 180, kwh: 1.2 },
  { id: 'dryer', name: 'Suszarka', icon: '🌀', durationMinutes: 90, kwh: 2.5 },
  { id: 'ev', name: 'Auto elektryczne', icon: '🚗', durationMinutes: 240, kwh: 30 },
  { id: 'boiler', name: 'Bojler', icon: '🚿', durationMinutes: 60, kwh: 2.0 },
];

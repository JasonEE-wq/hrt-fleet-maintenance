import { createContext, useContext } from 'react';
import type { FleetState, Language, Role, Text } from './model';
import type { Action } from './fleet';
import type { TranslationKey } from './i18n';

export interface FleetContextValue {
  state: FleetState;
  lang: Language;
  role: Role;
  t: (key: TranslationKey) => string;
  tx: (text: Text) => string;
  money: (n: number) => string;
  run: (action: Action) => boolean;
}

export const FleetContext = createContext<FleetContextValue>(null!);

export const useFleet = () => useContext(FleetContext);

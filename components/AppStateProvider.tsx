'use client';

import { createContext, useContext, useReducer, ReactNode } from 'react';

export type AppState = {
  city: string;
  sourceId: string | null;
  destId: string | null;
  peakMode: boolean;
  inspectedJunctionId: string | null;
  routeResult: any | null; // Add routeResult
};

export type AppAction =
  | { type: 'SELECT_SOURCE'; id: string }
  | { type: 'SELECT_DEST';   id: string }
  | { type: 'RESET' }
  | { type: 'TOGGLE_PEAK_MODE' }
  | { type: 'INSPECT_JUNCTION'; id: string | null }
  | { type: 'SET_ROUTE_RESULT'; result: any | null };

const AppStateContext = createContext<AppState | null>(null);
const AppDispatchContext = createContext<React.Dispatch<AppAction> | null>(null);

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SELECT_SOURCE':
      return { ...state, sourceId: action.id };
    case 'SELECT_DEST':
      return { ...state, destId: action.id };
    case 'RESET':
      return { ...state, sourceId: null, destId: null, routeResult: null, inspectedJunctionId: null };
    case 'TOGGLE_PEAK_MODE':
      return { ...state, peakMode: !state.peakMode };
    case 'INSPECT_JUNCTION':
      return { ...state, inspectedJunctionId: action.id };
    case 'SET_ROUTE_RESULT':
      return { ...state, routeResult: action.result };
    default:
      return state;
  }
}

export default function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, {
    city: 'bhubaneswar',
    sourceId: null,
    destId: null,
    peakMode: false,
    inspectedJunctionId: null,
    routeResult: null,
  });

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) throw new Error('useAppState must be used within AppStateProvider');
  return context;
}

export function useAppDispatch() {
  const context = useContext(AppDispatchContext);
  if (!context) throw new Error('useAppDispatch must be used within AppStateProvider');
  return context;
}

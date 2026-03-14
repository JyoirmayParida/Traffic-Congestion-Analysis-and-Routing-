'use client';

import { createContext, useContext, useReducer, useEffect, ReactNode, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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
      return { ...state, sourceId: action.id, destId: null, inspectedJunctionId: action.id, routeResult: null };
    case 'SELECT_DEST':
      return { ...state, destId: action.id, inspectedJunctionId: action.id };
    case 'RESET':
      return { ...state, sourceId: null, destId: null, inspectedJunctionId: null, routeResult: null };
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

function AppStateSync({ state, dispatch }: { state: AppState, dispatch: React.Dispatch<AppAction> }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;
    
    if (state.sourceId) {
      if (params.get('source') !== state.sourceId) {
        params.set('source', state.sourceId);
        changed = true;
      }
    } else if (params.has('source')) {
      params.delete('source');
      changed = true;
    }

    if (state.destId) {
      if (params.get('dest') !== state.destId) {
        params.set('dest', state.destId);
        changed = true;
      }
    } else if (params.has('dest')) {
      params.delete('dest');
      changed = true;
    }

    if (changed) {
      router.push(`/?${params.toString()}`, { scroll: false });
    }
  }, [state.sourceId, state.destId, router, searchParams]);

  // Sync URL to state (for back button)
  useEffect(() => {
    const source = searchParams.get('source');
    const dest = searchParams.get('dest');

    if (source !== state.sourceId && source) {
      dispatch({ type: 'SELECT_SOURCE', id: source });
    }
    if (dest !== state.destId && dest) {
      dispatch({ type: 'SELECT_DEST', id: dest });
    }
  }, [searchParams, state.sourceId, state.destId, dispatch]);

  return null;
}

export default function AppStateProvider({ children }: { children: ReactNode }) {
  const initialState: AppState = {
    city: 'bhubaneswar', // Hardcode bhubaneswar
    sourceId: null,
    destId: null,
    peakMode: false,
    inspectedJunctionId: null,
    routeResult: null,
  };

  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        <Suspense fallback={null}>
          <AppStateSync state={state} dispatch={dispatch} />
        </Suspense>
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

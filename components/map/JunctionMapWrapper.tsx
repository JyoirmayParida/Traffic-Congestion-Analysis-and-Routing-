'use client';

import dynamic from 'next/dynamic';
import type { Edge, RouteQueryOutput } from '@/types';
import type { MapJunction } from './JunctionMapClient';
import { useAppState, useAppDispatch } from '../AppStateProvider';
import FeatureInspector from '../inspector/FeatureInspector';

const JunctionMapClient = dynamic(() => import('./JunctionMapClient'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-slate-100 animate-pulse flex items-center justify-center border-b md:border-b-0 border-slate-200">
      <div className="flex flex-col items-center space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
        <p className="text-slate-500 font-medium">Loading interactive map...</p>
      </div>
    </div>
  ),
});

interface Props {
  junctions: MapJunction[];
  edges: Edge[];
  initialRoute: RouteQueryOutput | null;
  sourceId?: string | null;
  destId?: string | null;
}

export default function JunctionMapWrapper({ junctions, edges }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const handleJunctionClick = (id: string) => {
    dispatch({ type: 'INSPECT_JUNCTION', id });
    
    if (!state.sourceId) {
      dispatch({ type: 'SELECT_SOURCE', id });
    } else if (!state.destId) {
      dispatch({ type: 'SELECT_DEST', id });
    } else {
      dispatch({ type: 'SELECT_SOURCE', id });
    }
  };

  const inspectedJunction = state.inspectedJunctionId 
    ? junctions.find(j => j.id === state.inspectedJunctionId) 
    : null;

  return (
    <>
      <JunctionMapClient 
        junctions={junctions} 
        edges={edges} 
        initialRoute={state.routeResult}
        sourceId={state.sourceId}
        destId={state.destId}
        onJunctionClick={handleJunctionClick}
      />
      {inspectedJunction && (
        <FeatureInspector 
          junction={inspectedJunction} 
          snapshot={null} 
          onSimulateResult={() => {}} 
        />
      )}
    </>
  );
}

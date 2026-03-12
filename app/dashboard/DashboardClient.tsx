'use client';

import { useState } from 'react';
import JunctionMapWrapper from '@/components/map/JunctionMapWrapper';
import RoutePanel from '@/components/routing/RoutePanel';
import FeatureInspector from '@/components/inspector/FeatureInspector';
import type { Edge, RouteQueryOutput, CongestionLevel } from '@/types';
import type { MapJunction } from '@/components/map/JunctionMapClient';

interface Props {
  junctions: MapJunction[];
  edges: Edge[];
}

export default function DashboardClient({ junctions, edges }: Props) {
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [destId, setDestId] = useState<string | null>(null);
  const [routeResult, setRouteResult] = useState<RouteQueryOutput | null>(null);
  const [inspectedJunctionId, setInspectedJunctionId] = useState<string | null>(null);

  const handleJunctionClick = (id: string) => {
    setInspectedJunctionId(id);
    
    if (!sourceId) {
      setSourceId(id);
    } else if (!destId) {
      setDestId(id);
    } else {
      setSourceId(id);
      setDestId(null);
      setRouteResult(null);
    }
  };

  const handleReset = () => {
    setSourceId(null);
    setDestId(null);
    setRouteResult(null);
    setInspectedJunctionId(null);
  };

  const inspectedJunction = junctions.find(j => j.id === inspectedJunctionId) || null;

  const handleSimulateResult = (delay: number, level: CongestionLevel) => {
    // In a real app, you might want to update the map or route result based on the simulation
    console.log('Simulated delay:', delay, 'level:', level);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 h-[calc(100vh-140px)] relative">
      <div className="flex-1 h-full">
        <JunctionMapWrapper 
          junctions={junctions} 
          edges={edges} 
          initialRoute={routeResult}
          sourceId={sourceId}
          destId={destId}
          onJunctionClick={handleJunctionClick}
        />
      </div>
      <div className="w-full lg:w-[380px] shrink-0 h-full">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full overflow-hidden">
          <RoutePanel 
            junctions={junctions}
            sourceId={sourceId}
            destId={destId}
            onReset={handleReset}
            onRouteResult={setRouteResult}
          />
        </div>
      </div>
      
      {inspectedJunction && (
        <FeatureInspector 
          junction={inspectedJunction} 
          snapshot={null} 
          onSimulateResult={handleSimulateResult} 
        />
      )}
    </div>
  );
}

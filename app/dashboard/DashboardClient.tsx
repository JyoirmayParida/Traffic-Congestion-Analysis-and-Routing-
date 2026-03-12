'use client';

import { useState } from 'react';
import JunctionMapWrapper from '@/components/map/JunctionMapWrapper';
import RoutePanel from '@/components/routing/RoutePanel';
import type { Edge, RouteQueryOutput } from '@/types';
import type { MapJunction } from '@/components/map/JunctionMapClient';

interface Props {
  junctions: MapJunction[];
  edges: Edge[];
}

export default function DashboardClient({ junctions, edges }: Props) {
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [destId, setDestId] = useState<string | null>(null);
  const [routeResult, setRouteResult] = useState<RouteQueryOutput | null>(null);

  const handleJunctionClick = (id: string) => {
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
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 h-[calc(100vh-140px)]">
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
    </div>
  );
}

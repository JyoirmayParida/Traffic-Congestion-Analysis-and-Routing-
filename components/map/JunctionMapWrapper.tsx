'use client';

import dynamic from 'next/dynamic';
import type { Edge, RouteQueryOutput } from '@/types';
import type { MapJunction } from './JunctionMapClient';

const JunctionMapClient = dynamic(() => import('./JunctionMapClient'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] bg-slate-100 animate-pulse rounded-xl flex items-center justify-center border border-slate-200 shadow-sm">
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
  onJunctionClick?: (id: string) => void;
}

export default function JunctionMapWrapper(props: Props) {
  return <JunctionMapClient {...props} />;
}

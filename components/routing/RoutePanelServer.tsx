import { unstable_cache } from 'next/cache';
import { getRouteAction } from '@/app/actions/getRoute';
import RoutePanelClient from './RoutePanelClient';
import type { MapJunction } from '../map/JunctionMapClient';
import type { Edge } from '@/types';

// We need junctions to display names in the panel
const getJunctions = unstable_cache(
  async (): Promise<{ junctions: MapJunction[], edges: Edge[] }> => {
    try {
      const res = await fetch('http://localhost:8000/junctions/bhubaneswar', {
        next: { revalidate: 60 }
      });
      if (!res.ok) {
        console.error('Failed to fetch junctions');
        return { junctions: [], edges: [] };
      }
      const data = await res.json();
      const junctions = Array.isArray(data) ? data : [];
      return { junctions, edges: [] };
    } catch (error) {
      console.error('Error fetching junctions:', error);
      return { junctions: [], edges: [] };
    }
  },
  ['junctions-cache-bhubaneswar'],
  { revalidate: 60 }
);

export default async function RoutePanelServer({ searchParamsPromise }: { searchParamsPromise: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const searchParams = await searchParamsPromise;
  const sourceId = searchParams.source as string | undefined;
  const destId = searchParams.dest as string | undefined;

  const { junctions } = await getJunctions();

  let routeResult = null;
  if (sourceId && destId) {
    routeResult = await getRouteAction(null, {
      source_junction_id: sourceId,
      destination_junction_id: destId,
      departure_time: new Date().toISOString()
    });
  }

  return (
    <RoutePanelClient 
      junctions={junctions} 
      initialRouteResult={routeResult} 
    />
  );
}

import { unstable_cache } from 'next/cache';
import { getRouteAction } from '@/app/actions/getRoute';
import RoutePanelClient from './RoutePanelClient';
import type { MapJunction } from '../map/JunctionMapClient';
import type { Edge } from '@/types';

// We need junctions to display names in the panel
const getJunctions = unstable_cache(
  async (city: string): Promise<{ junctions: MapJunction[], edges: Edge[] }> => {
    return {
      junctions: [
        { id: 'J-1', name: 'Connaught Place', city: 'Delhi', latitude: 28.6315, longitude: 77.2167, congestion_level: 'SEVERE', current_delay_sec: 320 },
        { id: 'J-2', name: 'Rajiv Chowk', city: 'Delhi', latitude: 28.6328, longitude: 77.2197, congestion_level: 'HIGH', current_delay_sec: 210 },
        { id: 'J-3', name: 'India Gate', city: 'Delhi', latitude: 28.6129, longitude: 77.2295, congestion_level: 'LOW', current_delay_sec: 45 },
        { id: 'J-4', name: 'Red Fort', city: 'Delhi', latitude: 28.6562, longitude: 77.2410, congestion_level: 'MODERATE', current_delay_sec: 120 },
      ],
      edges: []
    };
  },
  ['junctions-cache'],
  { revalidate: 60 }
);

export default async function RoutePanelServer({ searchParamsPromise }: { searchParamsPromise: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const searchParams = await searchParamsPromise;
  const city = (searchParams.city as string) || 'Delhi';
  const sourceId = searchParams.source as string | undefined;
  const destId = searchParams.dest as string | undefined;

  const { junctions } = await getJunctions(city);

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

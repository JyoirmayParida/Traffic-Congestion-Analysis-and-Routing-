import { unstable_cache } from 'next/cache';
import JunctionMapWrapper from '@/components/map/JunctionMapWrapper';
import type { Edge } from '@/types';
import type { MapJunction } from './JunctionMapClient';

// Server-side cache with 60s revalidation
// Reduces Data Connect reads by ~90%
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
      const edges: Edge[] = [];
      
      junctions.forEach((j: any) => {
        if (j.edges && Array.isArray(j.edges)) {
          j.edges.forEach((e: any) => {
            edges.push({
              id: `${j.junction_id}-${e.to}`,
              source_id: j.junction_id,
              destination_id: e.to,
              base_time_sec: e.base_time_sec,
              distance_m: e.distance_m || 0
            });
          });
        }
      });

      return { junctions, edges };
    } catch (error) {
      console.error('Error fetching junctions:', error);
      return { junctions: [], edges: [] };
    }
  },
  ['junctions-cache-bhubaneswar'],
  { revalidate: 60 }
);

export default async function JunctionMapServer({ searchParamsPromise }: { searchParamsPromise: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const searchParams = await searchParamsPromise;
  const sourceId = searchParams.source as string | undefined;
  const destId = searchParams.dest as string | undefined;

  const data = await getJunctions();

  return (
    <JunctionMapWrapper 
      junctions={data.junctions} 
      edges={data.edges} 
      sourceId={sourceId || null}
      destId={destId || null}
      initialRoute={null} // Route is handled by RoutePanelServer
    />
  );
}

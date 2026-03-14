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
      return {
        junctions: data.junctions || [],
        edges: data.edges || []
      };
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

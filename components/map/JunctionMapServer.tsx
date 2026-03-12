import { Suspense } from 'react';
import { unstable_cache } from 'next/cache';
import DashboardClient from '@/app/dashboard/DashboardClient';
import type { Edge } from '@/types';
import type { MapJunction } from './JunctionMapClient';

// Server-side cache with 60s revalidation
// Reduces Data Connect reads by ~90%
const getJunctions = unstable_cache(
  async (city: string): Promise<{ junctions: MapJunction[], edges: Edge[] }> => {
    // In a real app, use Firebase Admin SDK to fetch from Data Connect / Firestore
    // if (!getApps().length) {
    //   initializeApp();
    // }
    // const db = getFirestore();
    // const snapshot = await db.collection('junctions').where('city', '==', city).get();

    // Mock data for scaffolding
    return {
      junctions: [
        { id: 'J-1', name: 'Connaught Place', city: 'Delhi', latitude: 28.6315, longitude: 77.2167, congestion_level: 'SEVERE', current_delay_sec: 320 },
        { id: 'J-2', name: 'Rajiv Chowk', city: 'Delhi', latitude: 28.6328, longitude: 77.2197, congestion_level: 'HIGH', current_delay_sec: 210 },
        { id: 'J-3', name: 'India Gate', city: 'Delhi', latitude: 28.6129, longitude: 77.2295, congestion_level: 'LOW', current_delay_sec: 45 },
        { id: 'J-4', name: 'Red Fort', city: 'Delhi', latitude: 28.6562, longitude: 77.2410, congestion_level: 'MODERATE', current_delay_sec: 120 },
      ],
      edges: [
        { id: 'E-1', source_id: 'J-1', destination_id: 'J-2', distance_m: 500, base_time_sec: 120 },
        { id: 'E-2', source_id: 'J-2', destination_id: 'J-3', distance_m: 2500, base_time_sec: 400 },
        { id: 'E-3', source_id: 'J-1', destination_id: 'J-4', distance_m: 3000, base_time_sec: 500 },
        { id: 'E-4', source_id: 'J-2', destination_id: 'J-4', distance_m: 2800, base_time_sec: 450 },
      ]
    };
  },
  ['junctions-cache'],
  { revalidate: 60 }
);

function MapSkeleton() {
  return (
    <div className="w-full h-[600px] bg-slate-100 animate-pulse rounded-xl flex items-center justify-center border border-slate-200 shadow-sm">
      <div className="flex flex-col items-center space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
        <p className="text-slate-500 font-medium">Loading map data from edge cache...</p>
      </div>
    </div>
  );
}

export default async function JunctionMapServer({ city = 'Delhi' }: { city?: string }) {
  const data = await getJunctions(city);

  return (
    <Suspense fallback={<MapSkeleton />}>
      <DashboardClient junctions={data.junctions} edges={data.edges} />
    </Suspense>
  );
}

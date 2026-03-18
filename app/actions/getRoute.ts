'use server';

import type { RouteQueryInput, RouteQueryOutput } from '@/types';

export async function getRouteAction(state: RouteQueryOutput | null, input: RouteQueryInput): Promise<RouteQueryOutput> {
  try {
    const res = await fetch('http://localhost:8000/route', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_id: input.source_junction_id,
        destination_id: input.destination_junction_id,
        city: "bhubaneswar",
        k_alternatives: 2
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch route: ${res.statusText}`);
    }

    const data = await res.json();
    
    // Calculate total delay
    const delay_sec = data.optimal_segments?.reduce((acc: number, s: any) => acc + (s.predicted_delay_sec || 0), 0) || 0;
    
    // Map optimal segments
    const optimalSegments = (data.optimal_segments || []).map((seg: any, idx: number) => {
      const nextJunctionId = data.optimal_path?.[idx + 1] || seg.junction_id;
      return {
        from: seg.junction_id,
        to: nextJunctionId,
        base_time_sec: 0,
        predicted_delay_sec: seg.predicted_delay_sec || 0,
        weight: seg.predicted_delay_sec || 0,
      };
    });

    // Map alternatives
    const mappedAlternatives = (data.alternatives || []).map((alt: any) => {
      const altSegments = (alt.segments || []).map((seg: any, idx: number) => {
        const nextJunctionId = alt.path?.[idx + 1] || seg.junction_id;
        return {
          from: seg.junction_id,
          to: nextJunctionId,
          base_time_sec: 0,
          predicted_delay_sec: seg.predicted_delay_sec || 0,
          weight: seg.predicted_delay_sec || 0,
        };
      });

      return {
        route: alt.path || [],
        total_travel_time_sec: alt.total_time_sec || 0,
        total_distance_m: 0,
        delay_sec: 0,
        segments: altSegments,
      };
    });

    const mappedData: RouteQueryOutput = {
      optimal_route: {
        route: data.optimal_path || [],
        total_travel_time_sec: data.total_time_sec || 0,
        total_distance_m: data.total_distance_m || 0,
        delay_sec: delay_sec,
        segments: optimalSegments,
      },
      alternatives: mappedAlternatives,
    };

    return mappedData;
  } catch (error) {
    console.error('Error fetching route:', error);
    throw error;
  }
}

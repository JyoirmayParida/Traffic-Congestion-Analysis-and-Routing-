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
        city: 'bhubaneswar',
        k_alternatives: 2
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch route: ${res.statusText}`);
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error fetching route:', error);
    throw error;
  }
}

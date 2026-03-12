'use server';

import type { RouteQueryInput, RouteQueryOutput } from '@/types';

// Mocked runFlow function to simulate Genkit execution
async function runFlow(flowFn: any, input: RouteQueryInput): Promise<RouteQueryOutput> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Mock result
  const result: RouteQueryOutput = {
    optimal_route: {
      route: [input.source_junction_id, 'J-2', input.destination_junction_id],
      total_travel_time_sec: 872, // 14m 32s
      total_distance_m: 1200,
      delay_sec: 100,
      segments: [
        {
          from: input.source_junction_id,
          to: 'J-2',
          base_time_sec: 200,
          predicted_delay_sec: 50,
          weight: 250,
        },
        {
          from: 'J-2',
          to: input.destination_junction_id,
          base_time_sec: 150,
          predicted_delay_sec: 50,
          weight: 200,
        }
      ]
    },
    alternatives: [
      {
        route: [input.source_junction_id, 'J-3', input.destination_junction_id],
        total_travel_time_sec: 1050,
        total_distance_m: 1500,
        delay_sec: 150,
        segments: [
          {
            from: input.source_junction_id,
            to: 'J-3',
            base_time_sec: 300,
            predicted_delay_sec: 100,
            weight: 400,
          },
          {
            from: 'J-3',
            to: input.destination_junction_id,
            base_time_sec: 200,
            predicted_delay_sec: 50,
            weight: 250,
          }
        ]
      }
    ]
  };
  return result;
}

// Dummy flow function
const getOptimalRouteFlow = async (input: any) => input;

export async function getRouteAction(state: RouteQueryOutput | null, input: RouteQueryInput): Promise<RouteQueryOutput> {
  // Call Genkit flow server-side (no CORS, no API key exposure)
  const result = await runFlow(getOptimalRouteFlow, input);
  return result;
}

import { RouteQueryInput, RouteQueryOutput, FeatureVector, CongestionLevel } from '@/types';

// Mocked Genkit client wrappers
// In a real implementation, you would use @genkit-ai/client or fetch to your backend

export async function getOptimalRouteFlow(input: RouteQueryInput): Promise<RouteQueryOutput> {
  const response = await fetch('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch optimal route');
  }
  
  return response.json();
}

export async function predictCongestionDelayFlow(input: FeatureVector): Promise<{ delay_sec: number, level: CongestionLevel }> {
  const response = await fetch('/api/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  
  if (!response.ok) {
    throw new Error('Failed to predict congestion delay');
  }
  
  return response.json();
}

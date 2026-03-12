'use server';

import type { FeatureVector, CongestionLevel } from '@/types';

export async function predictCongestionDelayAction(input: FeatureVector): Promise<{ delay_sec: number, level: CongestionLevel }> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 300));

  const [vehicle_count, queue_length, traffic_density, avg_speed, waiting_time, green_signal_ratio, monsoon_active, peak_hour] = input;

  // Simple mock logic for delay
  let delay = (vehicle_count * 0.2) + (queue_length * 0.1) + (traffic_density * 0.5) + (waiting_time * 0.3);
  if (avg_speed < 20) delay += 100;
  if (green_signal_ratio < 0.4) delay += 50;
  if (monsoon_active) delay *= 1.5;
  if (peak_hour) delay *= 1.3;

  delay = Math.round(delay);

  let level: CongestionLevel = 'LOW';
  if (delay > 600) level = 'SEVERE';
  else if (delay > 300) level = 'HIGH';
  else if (delay > 150) level = 'MODERATE';

  return { delay_sec: delay, level };
}

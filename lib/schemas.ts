import { z } from 'zod';

export const CongestionLevelSchema = z.enum(['LOW', 'MODERATE', 'HIGH', 'SEVERE']).describe('Congestion severity level');

export const FeatureVectorSchema = z.tuple([
  z.number().int().min(0).max(1000).describe('vehicle_count: int, 0-1000'),
  z.number().describe('queue_length: float, metres'),
  z.number().describe('traffic_density: float, vehicles/km'),
  z.number().describe('avg_speed: float, km/h'),
  z.number().describe('waiting_time: float, seconds'),
  z.number().min(0).max(1).describe('green_signal_ratio: float, 0.0-1.0'),
  z.boolean().describe('monsoon_active: bool, 0|1 (added 2026)'),
  z.boolean().describe('peak_hour: bool, 0|1 (IST 8-10AM or 5-8PM)')
]).describe('ML Feature Vector (length 8, EXACT order)');

export const JunctionSchema = z.object({
  id: z.string().describe('Unique junction identifier'),
  name: z.string().describe('Junction name'),
  latitude: z.number().describe('Latitude coordinate'),
  longitude: z.number().describe('Longitude coordinate'),
}).describe('Junction Data Connect Table');

export const EdgeSchema = z.object({
  id: z.string().describe('Unique edge identifier'),
  source_id: z.string().describe('Source junction ID'),
  destination_id: z.string().describe('Destination junction ID'),
  distance_m: z.number().describe('Distance in metres'),
  base_time_sec: z.number().describe('Base travel time in seconds'),
}).describe('Edge Data Connect Table');

export const TrafficSnapshotSchema = z.object({
  id: z.string().describe('Unique snapshot identifier'),
  junction_id: z.string().describe('Junction ID'),
  timestamp: z.string().datetime().describe('Snapshot timestamp'),
  features: FeatureVectorSchema,
}).describe('TrafficSnapshot Data Connect Table');

export const RouteQueryInputSchema = z.object({
  source_junction_id: z.string().describe('Source junction ID'),
  destination_junction_id: z.string().describe('Destination junction ID'),
  departure_time: z.string().datetime().describe('Departure time in ISO 8601 format'),
}).describe('Input for getOptimalRouteFlow');

export const RouteSegmentSchema = z.object({
  from: z.string().describe('Source junction of segment'),
  to: z.string().describe('Destination junction of segment'),
  base_time_sec: z.number().describe('Base travel time without congestion'),
  predicted_delay_sec: z.number().describe('Predicted delay at destination junction'),
  weight: z.number().describe('Edge weight W(u,v) = base_time_sec(u,v) + predicted_delay(v)'),
}).describe('Detailed route segment');

export const AlternativeRouteSchema = z.object({
  route: z.array(z.string()).describe('Array of junction IDs forming the route'),
  total_travel_time_sec: z.number().describe('Total estimated travel time in seconds'),
  total_distance_m: z.number().describe('Total distance in metres'),
  delay_sec: z.number().describe('Total delay in seconds'),
  segments: z.array(RouteSegmentSchema).describe('Detailed route segments'),
}).describe('Alternative route option');

export const RouteQueryOutputSchema = z.object({
  optimal_route: AlternativeRouteSchema.describe('The best route with minimum travel time'),
  alternatives: z.array(AlternativeRouteSchema).describe('Alternative routes considered'),
}).describe('Output of getOptimalRouteFlow');


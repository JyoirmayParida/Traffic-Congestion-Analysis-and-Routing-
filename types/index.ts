import { z } from 'zod';
import {
  CongestionLevelSchema,
  FeatureVectorSchema,
  JunctionSchema,
  EdgeSchema,
  TrafficSnapshotSchema,
  RouteQueryInputSchema,
  AlternativeRouteSchema,
  RouteQueryOutputSchema,
  RouteSegmentSchema
} from '@/lib/schemas';

export type CongestionLevel = z.infer<typeof CongestionLevelSchema>;
export type FeatureVector = z.infer<typeof FeatureVectorSchema>;
export type Junction = z.infer<typeof JunctionSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type TrafficSnapshot = z.infer<typeof TrafficSnapshotSchema>;
export type RouteQueryInput = z.infer<typeof RouteQueryInputSchema>;
export type RouteSegment = z.infer<typeof RouteSegmentSchema>;
export type AlternativeRoute = z.infer<typeof AlternativeRouteSchema>;
export type RouteQueryOutput = z.infer<typeof RouteQueryOutputSchema>;

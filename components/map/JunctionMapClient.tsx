'use client';

import { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Polyline, ZoomControl } from 'react-leaflet';
import type { Junction, Edge, RouteQueryOutput, CongestionLevel } from '@/types';

const CONGESTION_COLORS: Record<CongestionLevel, string> = {
  LOW: '#22c55e',
  MODERATE: '#f59e0b',
  HIGH: '#ef4444',
  SEVERE: '#7f1d1d',
};

export type MapJunction = Junction & {
  city: string;
  congestion_level: CongestionLevel;
  current_delay_sec: number;
};

interface Props {
  junctions: MapJunction[];
  edges: Edge[];
  initialRoute: RouteQueryOutput | null;
  sourceId?: string | null;
  destId?: string | null;
  onJunctionClick?: (id: string) => void;
}

export default function JunctionMapClient({ junctions, edges, initialRoute, sourceId, destId, onJunctionClick }: Props) {
  const handleJunctionClick = (id: string) => {
    if (onJunctionClick) {
      onJunctionClick(id);
    }
  };

  const routeResult = initialRoute;

  const edgePolylines = useMemo(() => {
    return edges.map((edge) => {
      const source = junctions.find((j) => j.id === edge.source_id);
      const dest = junctions.find((j) => j.id === edge.destination_id);
      if (!source || !dest) return null;

      const destCongestion = dest.congestion_level || 'LOW';
      let color = CONGESTION_COLORS[destCongestion as CongestionLevel];
      let weight = 2;
      let dashArray = undefined;

      const isOptimal = routeResult?.optimal_route?.segments.some(
        (s: any) => s.from === edge.source_id && s.to === edge.destination_id
      );
      const isAlternative = routeResult?.alternatives?.some(
        (alt: any) => alt.segments.some((s: any) => s.from === edge.source_id && s.to === edge.destination_id)
      );

      if (isOptimal) {
        color = '#1d4ed8';
        weight = 5;
      } else if (isAlternative) {
        color = '#9ca3af';
        weight = 2;
        dashArray = '6 4';
      }

      return (
        <Polyline
          key={edge.id}
          positions={[[source.latitude, source.longitude], [dest.latitude, dest.longitude]]}
          pathOptions={{
            color,
            weight,
            dashArray,
          }}
        />
      );
    });
  }, [junctions, edges, routeResult]);

  return (
    <div className="w-full h-[600px] rounded-xl overflow-hidden shadow-sm border border-slate-200 relative">
      <MapContainer
        center={[20.5937, 78.9629]}
        zoom={12}
        style={{ height: '100%', width: '100%', zIndex: 0 }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomControl position="topright" />

        {edgePolylines}

        {junctions.map((j) => {
          const isSource = j.id === sourceId;
          const isDest = j.id === destId;
          const fillColor = CONGESTION_COLORS[j.congestion_level as CongestionLevel] || CONGESTION_COLORS.LOW;

          let color = fillColor;
          let weight = 1;

          if (isSource) {
            color = '#2563eb';
            weight = 4;
          } else if (isDest) {
            color = '#7c3aed';
            weight = 4;
          }

          return (
            <CircleMarker
              key={j.id}
              center={[j.latitude, j.longitude]}
              radius={10}
              pathOptions={{
                fillColor,
                fillOpacity: 1,
                color,
                weight,
              }}
              eventHandlers={{
                click: () => handleJunctionClick(j.id),
              }}
            >
              <Tooltip>
                <div className="font-sans">
                  <div className="font-bold text-sm text-slate-900">{j.name}</div>
                  <div className="mt-1">
                    <span
                      className="inline-block px-2 py-1 text-[10px] font-bold text-white rounded"
                      style={{ backgroundColor: fillColor }}
                    >
                      {j.congestion_level}
                    </span>
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="absolute bottom-4 left-4 z-[1000] bg-white p-3 rounded-lg shadow-md border border-slate-200">
        <h4 className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">Congestion</h4>
        <div className="space-y-1.5">
          {Object.entries(CONGESTION_COLORS).map(([level, color]) => (
            <div key={level} className="flex items-center text-xs text-slate-600">
              <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: color }} />
              {level}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

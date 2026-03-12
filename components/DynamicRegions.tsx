import { Suspense } from 'react';
import JunctionMapServer from '@/components/map/JunctionMapServer';
import RoutePanelServer from '@/components/routing/RoutePanelServer';
import MapSkeleton from '@/components/skeletons/MapSkeleton';
import PanelSkeleton from '@/components/skeletons/PanelSkeleton';

export default function DynamicRegions({ searchParamsPromise }: { searchParamsPromise: Promise<{ [key: string]: string | string[] | undefined }> }) {
  return (
    <>
      {/* Map Region */}
      <div className="w-full md:w-[60%] xl:w-[65%] h-[50vh] md:h-full relative">
        <Suspense fallback={<MapSkeleton />}>
          <JunctionMapServer searchParamsPromise={searchParamsPromise} />
        </Suspense>
      </div>

      {/* Panel Region */}
      <div className="w-full md:w-[40%] xl:w-[35%] h-[50vh] md:h-full bg-white border-t md:border-t-0 md:border-l border-slate-200 shadow-xl z-10">
        <Suspense fallback={<PanelSkeleton />}>
          <RoutePanelServer searchParamsPromise={searchParamsPromise} />
        </Suspense>
      </div>
    </>
  );
}

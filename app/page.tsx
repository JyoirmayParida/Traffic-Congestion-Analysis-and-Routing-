import { Suspense } from 'react';
import AppHeader from '@/components/layout/AppHeader';
import PeakHourBanner from '@/components/layout/PeakHourBanner';
import DynamicRegions from '@/components/DynamicRegions';
import AppStateProvider from '@/components/AppStateProvider';

// Enable Partial Pre-rendering
export const experimental_ppr = true;

export default function HomePage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  return (
    <AppStateProvider>
      <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
        {/* STATIC SHELL */}
        <AppHeader />
        <PeakHourBanner />
        
        {/* DYNAMIC REGIONS */}
        <main className="flex-1 flex flex-col md:flex-row relative overflow-hidden">
          <DynamicRegions searchParamsPromise={searchParams} />
        </main>
      </div>
    </AppStateProvider>
  );
}

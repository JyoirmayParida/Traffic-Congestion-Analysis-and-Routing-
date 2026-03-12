'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAppState } from '@/components/AppStateProvider';

export default function PeakHourBanner() {
  const [isPeak, setIsPeak] = useState(false);
  const state = useAppState();

  useEffect(() => {
    const checkPeakHour = () => {
      // IST is UTC+5:30
      const now = new Date();
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const ist = new Date(utc + (3600000 * 5.5));
      
      const hours = ist.getHours();
      
      // Morning peak: 8 AM to 11 AM
      // Evening peak: 5 PM to 9 PM
      const isMorningPeak = hours >= 8 && hours < 11;
      const isEveningPeak = hours >= 17 && hours < 21;
      
      setIsPeak(isMorningPeak || isEveningPeak);
    };

    checkPeakHour();
    const interval = setInterval(checkPeakHour, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  if (!isPeak && !state.peakMode) return null;

  return (
    <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center text-sm font-medium shrink-0 z-10 shadow-sm">
      <AlertTriangle className="w-4 h-4 mr-2" />
      {state.peakMode ? 'Simulated Peak Hour Active' : 'Current time is within IST Peak Hours. Expect higher congestion.'}
    </div>
  );
}

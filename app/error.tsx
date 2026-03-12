'use client';

import { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">Something went wrong!</h2>
        <p className="text-slate-600">
          We encountered an error while loading the traffic routing data.
        </p>
        <button
          onClick={() => reset()}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

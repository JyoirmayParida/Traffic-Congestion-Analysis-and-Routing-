import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Junction } from '@/types';

export function useJunctions() {
  return useQuery({
    queryKey: ['junctions'],
    queryFn: async (): Promise<Junction[]> => {
      // In a real app, this would fetch from Firestore
      // const snapshot = await getDocs(collection(db, 'junctions'));
      // return snapshot.docs.map(doc => doc.data() as Junction);
      
      // Mock data for scaffolding
      return [
        { id: 'J-1', name: 'Connaught Place', latitude: 28.6315, longitude: 77.2167 },
        { id: 'J-2', name: 'Rajiv Chowk', latitude: 28.6328, longitude: 77.2197 },
        { id: 'J-3', name: 'India Gate', latitude: 28.6129, longitude: 77.2295 },
      ];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

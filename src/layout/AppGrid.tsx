import React from 'react';
import { useUIStore } from '../store/ui';

interface AppGridProps {
  children: React.ReactNode;
}

export default function AppGrid({ children }: AppGridProps) {
  const { openDrawer } = useUIStore();
  
  const getColumnTemplate = () => (Boolean(openDrawer) ? '1fr 24rem' : '1fr');

  return (
    <div 
      className="grid h-full w-full min-h-0"
      style={{
        gridTemplateColumns: getColumnTemplate(),
        gridTemplateRows: '1fr',          // 👈 add this so the row fills height
      }}
    >
      {children}
    </div>
  );
}
import React from 'react';
import { useUIStore } from '../store/ui';

interface AppGridProps {
  children: React.ReactNode;
}

export default function AppGrid({ children }: AppGridProps) {
  const { openDrawer, isMobile } = useUIStore();
  
  // Only apply right drawer layout on desktop when right drawer is open
  // Left navigation is always visible on desktop, so we don't need to account for it
  const getColumnTemplate = () => {
    if (isMobile) {
      // On mobile, left nav is overlay, so only right drawer affects layout
      return Boolean(openDrawer) ? '1fr 24rem' : '1fr';
    } else {
      // On desktop, left nav is always visible (w-64 = 16rem), right drawer is conditional
      return Boolean(openDrawer) ? '16rem 1fr 24rem' : '16rem 1fr';
    }
  };

  return (
    <div 
      className="grid h-full w-full min-h-0"
      style={{
        gridTemplateColumns: getColumnTemplate(),
        gridTemplateRows: '1fr',
      }}
    >
      {children}
    </div>
  );
}
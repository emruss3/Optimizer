import React from 'react';
import { useUIStore } from '../store/ui';

interface DrawerOverlayProps {
  children: React.ReactNode;
}

export default function DrawerOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      <div className="pointer-events-auto">
        {children}
      </div>
    </div>
  );
}
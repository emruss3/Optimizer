import React from 'react';

interface SkeletonLoaderProps {
  className?: string;
  lines?: number;
  height?: string;
  width?: string;
}

export function SkeletonLoader({ 
  className = '', 
  lines = 1, 
  height = '1rem', 
  width = '100%' 
}: SkeletonLoaderProps) {
  return (
    <div className={`animate-pulse ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="bg-gray-200 rounded"
          style={{
            height,
            width: index === lines - 1 ? '75%' : width,
            marginBottom: index < lines - 1 ? '0.5rem' : '0'
          }}
        />
      ))}
    </div>
  );
}

export function MapSkeletonLoader() {
  return (
    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <SkeletonLoader lines={2} width="200px" />
      </div>
    </div>
  );
}

export function ParcelCardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <SkeletonLoader lines={1} height="1.5rem" width="60%" className="mb-2" />
      <SkeletonLoader lines={2} height="1rem" width="100%" className="mb-2" />
      <SkeletonLoader lines={1} height="1rem" width="40%" />
    </div>
  );
}

export function AnalysisPanelSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonLoader lines={1} height="2rem" width="50%" />
      <div className="grid grid-cols-2 gap-4">
        <SkeletonLoader lines={3} height="1rem" />
        <SkeletonLoader lines={3} height="1rem" />
      </div>
      <SkeletonLoader lines={4} height="1rem" />
    </div>
  );
}

export function SkeletonParcelList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <SkeletonLoader lines={1} height="1.25rem" width="60%" />
            <SkeletonLoader lines={1} height="1rem" width="20%" />
          </div>
          <SkeletonLoader lines={2} height="1rem" width="100%" />
          <div className="flex items-center space-x-4 mt-3">
            <SkeletonLoader lines={1} height="1rem" width="30%" />
            <SkeletonLoader lines={1} height="1rem" width="25%" />
            <SkeletonLoader lines={1} height="1rem" width="20%" />
          </div>
        </div>
      ))}
    </div>
  );
}
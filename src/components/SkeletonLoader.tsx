import React from 'react';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
}

export function Skeleton({ className = '', width, height, rounded = false }: SkeletonProps) {
  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div 
      className={`animate-pulse bg-gray-200 ${rounded ? 'rounded-full' : 'rounded'} ${className}`}
      style={style}
    />
  );
}

export function SkeletonText({ lines = 1, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i} 
          height={16} 
          className={i === lines - 1 ? 'w-3/4' : 'w-full'} 
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`border border-gray-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-center space-x-3 mb-3">
        <Skeleton width={40} height={40} rounded />
        <div className="flex-1">
          <Skeleton height={16} className="mb-2" />
          <Skeleton height={12} width="60%" />
        </div>
      </div>
      <SkeletonText lines={2} className="mb-3" />
      <div className="flex space-x-2">
        <Skeleton width={80} height={32} />
        <Skeleton width={60} height={32} />
      </div>
    </div>
  );
}

export function SkeletonTable({ 
  rows = 5, 
  columns = 4, 
  className = '' 
}: { 
  rows?: number; 
  columns?: number; 
  className?: string; 
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {/* Header */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`header-${i}`} height={20} />
        ))}
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={`row-${rowIndex}`} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={`cell-${rowIndex}-${colIndex}`} height={16} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonParcelList({ count = 3, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-gray-50 p-3 rounded-lg">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <Skeleton height={16} className="mb-1" />
              <Skeleton height={12} width="40%" className="mb-2" />
              <div className="grid grid-cols-2 gap-2">
                <Skeleton height={10} width="60%" />
                <Skeleton height={10} width="50%" />
              </div>
            </div>
            <div className="ml-2 flex space-x-1">
              <Skeleton width={24} height={24} rounded />
              <Skeleton width={24} height={24} rounded />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonMap({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-gray-100 animate-pulse ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 opacity-50"></div>
      
      {/* Mock parcels */}
      <div className="absolute top-1/4 left-1/4 w-16 h-12 bg-gray-400 opacity-60 rounded transform rotate-12"></div>
      <div className="absolute top-1/3 right-1/3 w-20 h-16 bg-gray-400 opacity-60 rounded transform -rotate-6"></div>
      <div className="absolute bottom-1/3 left-1/2 w-12 h-20 bg-gray-400 opacity-60 rounded transform rotate-45"></div>
      
      {/* Loading text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-white bg-opacity-90 px-4 py-2 rounded-lg">
          <p className="text-gray-600 font-medium">Loading map...</p>
        </div>
      </div>
    </div>
  );
}
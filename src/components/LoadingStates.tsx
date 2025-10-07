import React from 'react';
import { Loader2, Map, Building2, BarChart3, Calculator } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <Loader2 className={`animate-spin ${sizeClasses[size]} ${className}`} />
  );
}

interface LoadingCardProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  progress?: number;
}

export function LoadingCard({ title, description, icon, progress }: LoadingCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center space-x-4">
        <div className="flex-shrink-0">
          {icon || <LoadingSpinner size="lg" className="text-blue-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600 mt-1">{description}</p>
          {progress !== undefined && (
            <div className="mt-3">
              <div className="bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">{progress}% complete</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface AnalysisLoadingProps {
  step: 'parcel' | 'analysis' | 'modeling' | 'complete';
}

export function AnalysisLoading({ step }: AnalysisLoadingProps) {
  const steps = [
    { id: 'parcel', title: 'Loading Parcel Data', description: 'Fetching property information and zoning data', icon: <Map className="w-6 h-6 text-blue-600" /> },
    { id: 'analysis', title: 'Running AI Analysis', description: 'Analyzing market trends and development potential', icon: <BarChart3 className="w-6 h-6 text-green-600" /> },
    { id: 'modeling', title: 'Financial Modeling', description: 'Calculating ROI, IRR, and cash flow projections', icon: <Calculator className="w-6 h-6 text-purple-600" /> },
    { id: 'complete', title: 'Analysis Complete', description: 'Your comprehensive property analysis is ready', icon: <Building2 className="w-6 h-6 text-green-600" /> }
  ];

  const currentStepIndex = steps.findIndex(s => s.id === step);
  const currentStep = steps[currentStepIndex];

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Analyzing Property</h3>
        <p className="text-sm text-gray-600">This may take a few moments...</p>
      </div>

      <div className="space-y-3">
        {steps.map((stepItem, index) => {
          const isActive = stepItem.id === step;
          const isCompleted = index < currentStepIndex;
          const isPending = index > currentStepIndex;

          return (
            <div
              key={stepItem.id}
              className={`flex items-center space-x-4 p-4 rounded-lg border transition-all duration-300 ${
                isActive 
                  ? 'border-blue-300 bg-blue-50' 
                  : isCompleted 
                    ? 'border-green-300 bg-green-50' 
                    : isPending 
                      ? 'border-gray-200 bg-gray-50' 
                      : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex-shrink-0">
                {isCompleted ? (
                  <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : isActive ? (
                  <LoadingSpinner size="md" className="text-blue-600" />
                ) : (
                  <div className="w-6 h-6 bg-gray-300 rounded-full" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className={`text-sm font-medium ${
                  isActive ? 'text-blue-900' : isCompleted ? 'text-green-900' : 'text-gray-500'
                }`}>
                  {stepItem.title}
                </h4>
                <p className={`text-xs ${
                  isActive ? 'text-blue-700' : isCompleted ? 'text-green-700' : 'text-gray-400'
                }`}>
                  {stepItem.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface SkeletonLoaderProps {
  lines?: number;
  height?: string;
  width?: string;
  className?: string;
}

export function SkeletonLoader({ 
  lines = 1, 
  height = "1rem", 
  width = "100%", 
  className = "" 
}: SkeletonLoaderProps) {
  return (
    <div className={`animate-pulse ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="bg-gray-200 rounded"
          style={{ 
            height, 
            width: index === lines - 1 ? width : '100%',
            marginBottom: index < lines - 1 ? '0.5rem' : '0'
          }}
        />
      ))}
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

interface ProgressBarProps {
  progress: number;
  label?: string;
  showPercentage?: boolean;
  color?: 'blue' | 'green' | 'yellow' | 'red';
}

export function ProgressBar({ 
  progress, 
  label, 
  showPercentage = true, 
  color = 'blue' 
}: ProgressBarProps) {
  const colorClasses = {
    blue: 'bg-blue-600',
    green: 'bg-green-600',
    yellow: 'bg-yellow-600',
    red: 'bg-red-600'
  };

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          {showPercentage && (
            <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
          )}
        </div>
      )}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className={`h-2 rounded-full transition-all duration-300 ${colorClasses[color]}`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
}

interface ToastProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  onClose?: () => void;
  duration?: number;
}

export function Toast({ type, title, message, onClose, duration = 5000 }: ToastProps) {
  const [isVisible, setIsVisible] = React.useState(true);

  React.useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onClose?.(), 300);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const typeClasses = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  const iconClasses = {
    success: 'text-green-400',
    error: 'text-red-400',
    warning: 'text-yellow-400',
    info: 'text-blue-400'
  };

  if (!isVisible) return null;

  return (
    <div className={`fixed top-4 right-4 z-50 max-w-sm w-full bg-white border rounded-lg shadow-lg transition-all duration-300 ${
      isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
    } ${typeClasses[type]}`}>
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <div className={`w-5 h-5 ${iconClasses[type]}`}>
              {type === 'success' && (
                <svg fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
              {type === 'error' && (
                <svg fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
              {type === 'warning' && (
                <svg fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              )}
              {type === 'info' && (
                <svg fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </div>
          <div className="ml-3 flex-1">
            <h4 className="text-sm font-medium">{title}</h4>
            {message && <p className="text-sm mt-1">{message}</p>}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="ml-4 flex-shrink-0 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

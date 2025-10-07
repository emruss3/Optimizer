import React, { useState, useEffect } from 'react';
import { 
  Map, 
  Building2, 
  BarChart3, 
  Calculator, 
  ArrowRight, 
  CheckCircle, 
  X,
  Play,
  Target,
  Zap
} from 'lucide-react';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: string;
  completed?: boolean;
}

interface UserOnboardingProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function UserOnboarding({ isOpen, onClose, onComplete }: UserOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to Parcel Intelligence',
      description: 'The most advanced real estate analysis platform for Nashville developers and investors.',
      icon: <Map className="w-8 h-8 text-blue-600" />,
      action: 'Get Started'
    },
    {
      id: 'explore',
      title: 'Explore the Map',
      description: 'Click any parcel on the map to view property details, zoning information, and development potential.',
      icon: <Target className="w-8 h-8 text-green-600" />,
      action: 'Try It Now'
    },
    {
      id: 'analyze',
      title: 'AI-Powered Analysis',
      description: 'Get instant underwriting, market trends, and investment recommendations powered by advanced AI.',
      icon: <BarChart3 className="w-8 h-8 text-purple-600" />,
      action: 'Run Analysis'
    },
    {
      id: 'design',
      title: 'Site Plan Designer',
      description: 'Design development scenarios with our CAD-like interface. Optimize building placement and amenities.',
      icon: <Building2 className="w-8 h-8 text-orange-600" />,
      action: 'Start Designing'
    },
    {
      id: 'financial',
      title: 'Financial Modeling',
      description: 'Calculate ROI, IRR, and cash flow projections with built-in financial analysis tools.',
      icon: <Calculator className="w-8 h-8 text-red-600" />,
      action: 'View Projections'
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const handleStepAction = (stepId: string) => {
    setCompletedSteps(prev => new Set([...prev, stepId]));
    
    // Auto-advance after action
    setTimeout(() => {
      handleNext();
    }, 1000);
  };

  if (!isOpen) return null;

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-white bg-opacity-20 p-2 rounded-lg">
                {currentStepData.icon}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Quick Tour</h2>
                <p className="text-blue-100 text-sm">Step {currentStep + 1} of {steps.length}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-blue-200 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-4">
            <div className="bg-white bg-opacity-20 rounded-full h-2">
              <div 
                className="bg-white h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="text-center mb-6">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              {currentStepData.icon}
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              {currentStepData.title}
            </h3>
            <p className="text-gray-600 text-lg leading-relaxed">
              {currentStepData.description}
            </p>
          </div>

          {/* Step Indicators */}
          <div className="flex justify-center space-x-2 mb-8">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`w-3 h-3 rounded-full transition-colors ${
                  index === currentStep 
                    ? 'bg-blue-600' 
                    : index < currentStep 
                      ? 'bg-green-500' 
                      : 'bg-gray-300'
                }`}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            {currentStepData.action && (
              <button
                onClick={() => handleStepAction(currentStepData.id)}
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center space-x-2"
              >
                <Play className="w-4 h-4" />
                <span>{currentStepData.action}</span>
              </button>
            )}
            
            <button
              onClick={handleNext}
              className="flex-1 border border-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center justify-center space-x-2"
            >
              <span>{currentStep === steps.length - 1 ? 'Complete' : 'Next'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex justify-center mt-4">
            <button
              onClick={handleSkip}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              Skip Tour
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Quick tips component for ongoing guidance
interface QuickTipProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  onDismiss: () => void;
  onAction?: () => void;
  actionText?: string;
}

export function QuickTip({ 
  title, 
  description, 
  icon, 
  onDismiss, 
  onAction, 
  actionText 
}: QuickTipProps) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
            {icon}
          </div>
        </div>
        <div className="ml-3 flex-1">
          <h4 className="text-sm font-medium text-blue-900">{title}</h4>
          <p className="text-sm text-blue-700 mt-1">{description}</p>
          {(onAction && actionText) && (
            <div className="mt-3">
              <button
                onClick={onAction}
                className="text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                {actionText} →
              </button>
            </div>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="ml-3 flex-shrink-0 text-blue-400 hover:text-blue-600"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Feature discovery tooltips
interface FeatureTooltipProps {
  target: string;
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  isVisible: boolean;
  onClose: () => void;
}

export function FeatureTooltip({ 
  target, 
  title, 
  description, 
  position, 
  isVisible, 
  onClose 
}: FeatureTooltipProps) {
  if (!isVisible) return null;

  const positionClasses = {
    top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 transform -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 transform -translate-y-1/2 ml-2'
  };

  return (
    <div className={`absolute z-50 ${positionClasses[position]}`}>
      <div className="bg-gray-900 text-white rounded-lg p-3 max-w-xs shadow-lg">
        <div className="flex items-start">
          <div className="flex-1">
            <h4 className="text-sm font-medium">{title}</h4>
            <p className="text-xs text-gray-300 mt-1">{description}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-2 text-gray-400 hover:text-white"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
        {/* Arrow */}
        <div className={`absolute w-2 h-2 bg-gray-900 transform rotate-45 ${
          position === 'top' ? 'top-full left-1/2 -translate-x-1/2 -translate-y-1/2' :
          position === 'bottom' ? 'bottom-full left-1/2 -translate-x-1/2 translate-y-1/2' :
          position === 'left' ? 'left-full top-1/2 -translate-y-1/2 -translate-x-1/2' :
          'right-full top-1/2 -translate-y-1/2 translate-x-1/2'
        }`} />
      </div>
    </div>
  );
}

// Keyboard shortcuts help
export function KeyboardShortcutsHelp() {
  const shortcuts = [
    { key: '⌘K', description: 'Open command palette' },
    { key: '⌘F', description: 'Open filters' },
    { key: '⌘P', description: 'Toggle project panel' },
    { key: '⌘A', description: 'Toggle analysis panel' },
    { key: 'Esc', description: 'Close all panels' }
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-3">Keyboard Shortcuts</h3>
      <div className="space-y-2">
        {shortcuts.map((shortcut, index) => (
          <div key={index} className="flex items-center justify-between">
            <span className="text-sm text-gray-600">{shortcut.description}</span>
            <kbd className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
              {shortcut.key}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

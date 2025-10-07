import React, { useState, useEffect } from 'react';
import { 
  Map, 
  Building2, 
  BarChart3, 
  Calculator, 
  Target,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Lightbulb,
  Zap,
  TrendingUp,
  DollarSign,
  Eye,
  Edit3,
  Play,
  Save,
  Share
} from 'lucide-react';

interface SmartNavigationProps {
  currentStep: 'explore' | 'analyze' | 'design' | 'financial' | 'compare';
  onStepChange: (step: 'explore' | 'analyze' | 'design' | 'financial' | 'compare') => void;
  selectedParcel?: any;
  hasProject?: boolean;
  analysisComplete?: boolean;
}

export function SmartNavigation({ 
  currentStep, 
  onStepChange, 
  selectedParcel, 
  hasProject, 
  analysisComplete 
}: SmartNavigationProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [nextAction, setNextAction] = useState<string>('');

  useEffect(() => {
    // Generate smart suggestions based on current state
    const newSuggestions: string[] = [];
    const newNextAction: string = '';

    switch (currentStep) {
      case 'explore':
        if (!selectedParcel) {
          newSuggestions.push('Click any parcel to view property details');
          newSuggestions.push('Use filters to find specific property types');
          setNextAction('Select a property to analyze');
        } else {
          newSuggestions.push(`Selected: ${selectedParcel.address}`);
          newSuggestions.push('Ready to run AI analysis');
          setNextAction('Run Property Analysis');
        }
        break;
        
      case 'analyze':
        if (selectedParcel && !analysisComplete) {
          newSuggestions.push('AI will evaluate development potential');
          newSuggestions.push('Market trends and zoning analysis');
          setNextAction('Start AI Analysis');
        } else if (analysisComplete) {
          newSuggestions.push('Analysis complete - ready for design');
          newSuggestions.push('View detailed financial projections');
          setNextAction('Design Site Plan');
        }
        break;
        
      case 'design':
        if (!hasProject) {
          newSuggestions.push('Create a project to save your work');
          newSuggestions.push('Design buildings and parking layout');
          setNextAction('Create Project');
        } else {
          newSuggestions.push('Add buildings to your site plan');
          newSuggestions.push('Optimize layout for maximum value');
          setNextAction('Add Buildings');
        }
        break;
        
      case 'financial':
        newSuggestions.push('Calculate ROI and cash flow projections');
        newSuggestions.push('Compare with market benchmarks');
        setNextAction('Run Financial Analysis');
        break;
        
      case 'compare':
        newSuggestions.push('Create multiple development scenarios');
        newSuggestions.push('Compare financial performance');
        setNextAction('Create Scenario');
        break;
    }

    setSuggestions(newSuggestions);
    setNextAction(newNextAction);
  }, [currentStep, selectedParcel, hasProject, analysisComplete]);

  const getStepIcon = (step: string) => {
    switch (step) {
      case 'explore': return <Map className="w-4 h-4" />;
      case 'analyze': return <BarChart3 className="w-4 h-4" />;
      case 'design': return <Building2 className="w-4 h-4" />;
      case 'financial': return <Calculator className="w-4 h-4" />;
      case 'compare': return <Target className="w-4 h-4" />;
      default: return <Map className="w-4 h-4" />;
    }
  };

  const getStepColor = (step: string) => {
    switch (step) {
      case 'explore': return 'blue';
      case 'analyze': return 'green';
      case 'design': return 'purple';
      case 'financial': return 'orange';
      case 'compare': return 'indigo';
      default: return 'gray';
    }
  };

  const steps = [
    { id: 'explore', label: 'Explore', description: 'Find properties' },
    { id: 'analyze', label: 'Analyze', description: 'AI insights' },
    { id: 'design', label: 'Design', description: 'Site planning' },
    { id: 'financial', label: 'Financial', description: 'ROI & projections' },
    { id: 'compare', label: 'Compare', description: 'Scenarios' }
  ];

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Step Navigation */}
        <div className="flex items-center space-x-1">
          {steps.map((step, index) => {
            const isActive = currentStep === step.id;
            const isCompleted = steps.findIndex(s => s.id === currentStep) > index;
            const color = getStepColor(step.id);
            
            return (
              <button
                key={step.id}
                onClick={() => onStepChange(step.id as any)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive 
                    ? `bg-${color}-100 text-${color}-700` 
                    : isCompleted
                      ? 'bg-green-100 text-green-700'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  getStepIcon(step.id)
                )}
                <span className="hidden sm:inline">{step.label}</span>
              </button>
            );
          })}
        </div>

        {/* Smart Suggestions */}
        <div className="flex items-center space-x-4">
          {suggestions.length > 0 && (
            <div className="hidden lg:flex items-center space-x-2 text-sm text-gray-600">
              <Lightbulb className="w-4 h-4" />
              <span>{suggestions[0]}</span>
            </div>
          )}
          
          {nextAction && (
            <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
              <Zap className="w-4 h-4" />
              <span>{nextAction}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface ContextualActionsProps {
  currentStep: 'explore' | 'analyze' | 'design' | 'financial' | 'compare';
  selectedParcel?: any;
  hasProject?: boolean;
  onAction: (action: string) => void;
}

export function ContextualActions({ 
  currentStep, 
  selectedParcel, 
  hasProject, 
  onAction 
}: ContextualActionsProps) {
  const getActions = () => {
    switch (currentStep) {
      case 'explore':
        return [
          { id: 'filter', label: 'Filter Properties', icon: <Target className="w-4 h-4" />, color: 'blue' },
          { id: 'search', label: 'Search Address', icon: <Map className="w-4 h-4" />, color: 'blue' },
          { id: 'favorites', label: 'Saved Properties', icon: <Eye className="w-4 h-4" />, color: 'gray' }
        ];
        
      case 'analyze':
        return [
          { id: 'hbu', label: 'HBU Analysis', icon: <TrendingUp className="w-4 h-4" />, color: 'green' },
          { id: 'market', label: 'Market Trends', icon: <BarChart3 className="w-4 h-4" />, color: 'green' },
          { id: 'zoning', label: 'Zoning Check', icon: <AlertCircle className="w-4 h-4" />, color: 'yellow' }
        ];
        
      case 'design':
        return [
          { id: 'building', label: 'Add Building', icon: <Building2 className="w-4 h-4" />, color: 'purple' },
          { id: 'parking', label: 'Add Parking', icon: <Target className="w-4 h-4" />, color: 'purple' },
          { id: 'amenities', label: 'Add Amenities', icon: <Edit3 className="w-4 h-4" />, color: 'purple' }
        ];
        
      case 'financial':
        return [
          { id: 'underwriting', label: 'Run Underwriting', icon: <Calculator className="w-4 h-4" />, color: 'orange' },
          { id: 'projections', label: 'Cash Flow', icon: <DollarSign className="w-4 h-4" />, color: 'orange' },
          { id: 'comparables', label: 'Market Comps', icon: <BarChart3 className="w-4 h-4" />, color: 'orange' }
        ];
        
      case 'compare':
        return [
          { id: 'scenario', label: 'New Scenario', icon: <Plus className="w-4 h-4" />, color: 'indigo' },
          { id: 'compare', label: 'Compare Results', icon: <Target className="w-4 h-4" />, color: 'indigo' },
          { id: 'export', label: 'Export Report', icon: <Share className="w-4 h-4" />, color: 'gray' }
        ];
        
      default:
        return [];
    }
  };

  const actions = getActions();

  return (
    <div className="p-4 bg-gray-50 border-t border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-900">Quick Actions</h3>
        <span className="text-xs text-gray-500">{currentStep.charAt(0).toUpperCase() + currentStep.slice(1)} Mode</span>
      </div>
      
      <div className="grid grid-cols-3 gap-2">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => onAction(action.id)}
            className={`flex flex-col items-center space-y-2 p-3 rounded-lg border transition-colors ${
              action.color === 'blue' ? 'border-blue-200 bg-blue-50 hover:bg-blue-100' :
              action.color === 'green' ? 'border-green-200 bg-green-50 hover:bg-green-100' :
              action.color === 'purple' ? 'border-purple-200 bg-purple-50 hover:bg-purple-100' :
              action.color === 'orange' ? 'border-orange-200 bg-orange-50 hover:bg-orange-100' :
              action.color === 'indigo' ? 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100' :
              'border-gray-200 bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <div className={`${
              action.color === 'blue' ? 'text-blue-600' :
              action.color === 'green' ? 'text-green-600' :
              action.color === 'purple' ? 'text-purple-600' :
              action.color === 'orange' ? 'text-orange-600' :
              action.color === 'indigo' ? 'text-indigo-600' :
              'text-gray-600'
            }`}>
              {action.icon}
            </div>
            <span className="text-xs font-medium text-gray-700 text-center">
              {action.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface WorkflowProgressProps {
  currentStep: 'explore' | 'analyze' | 'design' | 'financial' | 'compare';
  completedSteps: string[];
  onStepClick: (step: string) => void;
}

export function WorkflowProgress({ 
  currentStep, 
  completedSteps, 
  onStepClick 
}: WorkflowProgressProps) {
  const steps = [
    { id: 'explore', label: 'Explore', icon: <Map className="w-4 h-4" /> },
    { id: 'analyze', label: 'Analyze', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'design', label: 'Design', icon: <Building2 className="w-4 h-4" /> },
    { id: 'financial', label: 'Financial', icon: <Calculator className="w-4 h-4" /> },
    { id: 'compare', label: 'Compare', icon: <Target className="w-4 h-4" /> }
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-3">Workflow Progress</h3>
      
      <div className="space-y-2">
        {steps.map((step, index) => {
          const isActive = currentStep === step.id;
          const isCompleted = completedSteps.includes(step.id);
          const isClickable = isCompleted || isActive || index === 0;
          
          return (
            <button
              key={step.id}
              onClick={() => isClickable && onStepClick(step.id)}
              disabled={!isClickable}
              className={`w-full flex items-center space-x-3 p-2 rounded-lg transition-colors ${
                isActive 
                  ? 'bg-blue-100 text-blue-700' 
                  : isCompleted 
                    ? 'bg-green-100 text-green-700' 
                    : isClickable
                      ? 'hover:bg-gray-50 text-gray-700'
                      : 'text-gray-400 cursor-not-allowed'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                isActive ? 'bg-blue-600 text-white' :
                isCompleted ? 'bg-green-600 text-white' :
                'bg-gray-300 text-gray-500'
              }`}>
                {isCompleted ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  step.icon
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium">{step.label}</div>
                <div className="text-xs text-gray-500">
                  {isActive ? 'Current step' : isCompleted ? 'Completed' : 'Upcoming'}
                </div>
              </div>
              {isActive && (
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

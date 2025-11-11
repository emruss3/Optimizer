// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React from 'react';
import { Building2, Home, Users, Briefcase, ShoppingBag, Hotel } from 'lucide-react';
import { TemplateService } from '../../services/templateService';

interface TemplateSelectorProps {
  onSelectTemplate: (templateId: string) => void;
  onClose: () => void;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({ onSelectTemplate, onClose }) => {
  const templates = TemplateService.getTemplates();

  const getIcon = (type: string) => {
    switch (type) {
      case 'single-family':
        return <Home className="w-6 h-6" />;
      case 'duplex':
        return <Building2 className="w-6 h-6" />;
      case 'apartment':
        return <Users className="w-6 h-6" />;
      case 'office':
        return <Briefcase className="w-6 h-6" />;
      case 'retail':
        return <ShoppingBag className="w-6 h-6" />;
      case 'hotel':
        return <Hotel className="w-6 h-6" />;
      default:
        return <Building2 className="w-6 h-6" />;
    }
  };

  return (
    <div className="absolute top-16 left-16 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-50 min-w-[300px]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Layout Templates</h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700"
        >
          ×
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {templates.map((template) => (
          <button
            key={template.id}
            onClick={() => onSelectTemplate(template.id)}
            className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
            title={template.description}
          >
            <div className="text-blue-600 mb-2">
              {getIcon(template.type)}
            </div>
            <span className="text-sm font-medium text-gray-900">{template.name}</span>
            <span className="text-xs text-gray-500 mt-1">{template.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
};


import React from 'react';
import { Shield, Lock, AlertTriangle } from 'lucide-react';

export type UserRole = 'viewer' | 'analyst' | 'manager' | 'admin';

interface GuardProps {
  roles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
  disabled?: boolean;
  tooltip?: string;
}

// Mock current user - in real app this would come from auth context
const getCurrentUser = (): { role: UserRole; id: string; name: string } => {
  // TODO: Replace with actual auth context
  return {
    role: 'analyst', // Default role for demo
    id: 'user-1',
    name: 'Demo User'
  };
};

// Role hierarchy for permission checking
const ROLE_HIERARCHY: Record<UserRole, number> = {
  viewer: 1,
  analyst: 2,
  manager: 3,
  admin: 4
};

const hasPermission = (userRole: UserRole, requiredRoles: UserRole[]): boolean => {
  const userLevel = ROLE_HIERARCHY[userRole];
  return requiredRoles.some(role => userLevel >= ROLE_HIERARCHY[role]);
};

export default function Guard({ roles, children, fallback, disabled = false, tooltip }: GuardProps) {
  const currentUser = getCurrentUser();
  const hasAccess = hasPermission(currentUser.role, roles);

  if (!hasAccess) {
    if (fallback) {
      return <>{fallback}</>;
    }

    // Default locked state
    return (
      <div className="relative group">
        <div className="opacity-50 pointer-events-none">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 rounded">
          <div className="flex items-center space-x-1 text-gray-500">
            <Lock className="w-4 h-4" />
            <span className="text-xs font-medium">
              {roles.join('/')?.toUpperCase()}+
            </span>
          </div>
        </div>
        {tooltip && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
            {tooltip}
          </div>
        )}
      </div>
    );
  }

  if (disabled) {
    return (
      <div className="opacity-50 pointer-events-none">
        {children}
      </div>
    );
  }

  return <>{children}</>;
}

// Role badge component
export function RoleBadge({ role }: { role: UserRole }) {
  const colors = {
    viewer: 'bg-gray-100 text-gray-700',
    analyst: 'bg-blue-100 text-blue-700',
    manager: 'bg-purple-100 text-purple-700',
    admin: 'bg-red-100 text-red-700'
  };

  const icons = {
    viewer: Eye,
    analyst: BarChart3,
    manager: Shield,
    admin: Crown
  };

  const Icon = icons[role] || Shield;

  return (
    <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${colors[role]}`}>
      <Icon className="w-3 h-3" />
      <span className="capitalize">{role}</span>
    </div>
  );
}

// Hook for role-based logic
export function useUserRole() {
  const currentUser = getCurrentUser();
  
  return {
    user: currentUser,
    hasRole: (roles: UserRole[]) => hasPermission(currentUser.role, roles),
    isViewer: currentUser.role === 'viewer',
    isAnalyst: hasPermission(currentUser.role, ['analyst']),
    isManager: hasPermission(currentUser.role, ['manager']),
    isAdmin: currentUser.role === 'admin'
  };
}

// Import missing icons
import { Eye, BarChart3, Crown } from 'lucide-react';
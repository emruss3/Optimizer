import React, { useState, useEffect } from 'react';
import { 
  Download, Mail, FileText, Archive, Clock, CheckCircle, 
  AlertTriangle, X, Plus, Trash2, Eye, Bell
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUserRole } from './Guard';

interface BatchExport {
  id: string;
  userId: string;
  projectIds: string[];
  exportType: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
  errorMessage?: string;
  createdAt: Date;
  completedAt?: Date;
}

export default function BatchExportPanel() {
  const { user } = useUserRole();
  const [exports, setExports] = useState<BatchExport[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [exportType, setExportType] = useState<'pdf' | 'excel' | 'zip'>('pdf');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Mock project list - in real app would come from Supabase
  const availableProjects = [
    { id: 'demo-1', name: 'Demo Project', parcels: 5 },
    { id: 'nashville-dev', name: 'Nashville Development', parcels: 12 },
    { id: 'mixed-use-23', name: 'Mixed Use 2023', parcels: 8 },
    { id: 'assemblage-main', name: 'Main Street Assemblage', parcels: 15 }
  ];

  useEffect(() => {
    loadExports();
    
    // Set up realtime subscription for export updates
    const subscription = supabase
      ?.channel('batch-exports')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'batch_exports',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          const updatedExport = payload.new as any;
          setExports(prev => 
            prev.map(exp => 
              exp.id === updatedExport.id 
                ? { ...exp, status: updatedExport.status, downloadUrl: updatedExport.download_url }
                : exp
            )
          );
          
          // Show notification when export completes
          if (updatedExport.status === 'completed') {
            setNotification(`Export completed: ${updatedExport.export_type.toUpperCase()}`);
            setTimeout(() => setNotification(null), 5000);
          }
        }
      )
      .subscribe();

    return () => {
      subscription?.unsubscribe();
    };
  }, [user.id]);

  const loadExports = async () => {
    if (!supabase) return;

    try {
      const { data, error } = await supabase
        .from('batch_exports')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      const exportList = data?.map(item => ({
        id: item.id,
        userId: item.user_id,
        projectIds: item.project_ids,
        exportType: item.export_type,
        status: item.status,
        downloadUrl: item.download_url,
        errorMessage: item.error_message,
        createdAt: new Date(item.created_at),
        completedAt: item.completed_at ? new Date(item.completed_at) : undefined
      })) || [];

      setExports(exportList);
    } catch (error) {
      console.error('Error loading exports:', error);
    }
  };

  const handleStartExport = async () => {
    if (selectedProjects.length === 0) return;

    setLoading(true);

    try {
      // Create export record
      const { data: exportRecord, error } = await supabase
        .from('batch_exports')
        .insert({
          user_id: user.id,
          project_ids: selectedProjects,
          export_type: exportType,
          status: 'queued'
        })
        .select()
        .single();

      if (error) throw error;

      // Trigger edge function for processing
      const { error: funcError } = await supabase.functions.invoke('batch-pdf-export', {
        body: {
          exportId: exportRecord.id,
          projectIds: selectedProjects,
          exportType,
          email: email.trim() || undefined
        }
      });

      if (funcError) throw funcError;

      // Update local state
      const newExport: BatchExport = {
        id: exportRecord.id,
        userId: exportRecord.user_id,
        projectIds: exportRecord.project_ids,
        exportType: exportRecord.export_type,
        status: exportRecord.status,
        createdAt: new Date(exportRecord.created_at)
      };

      setExports(prev => [newExport, ...prev]);
      setSelectedProjects([]);
      setEmail('');
      setNotification(`Export started for ${selectedProjects.length} project(s)`);
      setTimeout(() => setNotification(null), 3000);

    } catch (error) {
      console.error('Export error:', error);
      setNotification('Failed to start export');
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'processing':
        return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued': return 'bg-yellow-50 text-yellow-800 border-yellow-200';
      case 'processing': return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'completed': return 'bg-green-50 text-green-800 border-green-200';
      case 'failed': return 'bg-red-50 text-red-800 border-red-200';
      default: return 'bg-gray-50 text-gray-800 border-gray-200';
    }
  };

  const formatDuration = (start: Date, end?: Date) => {
    const endTime = end || new Date();
    const diffMs = endTime.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return '< 1 min';
    if (diffMins < 60) return `${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ${diffMins % 60}m`;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
            <Archive className="w-5 h-5" />
            <span>Batch Export</span>
          </h3>
          
          {/* Notification Bell */}
          {notification && (
            <div className="flex items-center space-x-2 bg-blue-100 text-blue-800 px-3 py-1 rounded-lg">
              <Bell className="w-4 h-4" />
              <span className="text-sm">{notification}</span>
            </div>
          )}
        </div>
      </div>

      {/* Export Form */}
      <div className="p-4 border-b border-gray-200">
        <h4 className="font-semibold text-gray-900 mb-3">Queue New Export</h4>
        
        {/* Project Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Projects ({selectedProjects.length} selected)
          </label>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {availableProjects.map((project) => (
              <label key={project.id} className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedProjects.includes(project.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedProjects(prev => [...prev, project.id]);
                    } else {
                      setSelectedProjects(prev => prev.filter(id => id !== project.id));
                    }
                  }}
                  className="rounded"
                />
                <span className="font-medium">{project.name}</span>
                <span className="text-gray-500">({project.parcels} parcels)</span>
              </label>
            ))}
          </div>
        </div>

        {/* Export Options */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Export Format
            </label>
            <select
              value={exportType}
              onChange={(e) => setExportType(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus-ring"
            >
              <option value="pdf">PDF Reports</option>
              <option value="excel">Excel Spreadsheet</option>
              <option value="zip">Complete ZIP Package</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email (Optional)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Send download link to..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus-ring"
            />
          </div>
        </div>

        <button
          onClick={handleStartExport}
          disabled={selectedProjects.length === 0 || loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 transition-colors flex items-center justify-center space-x-2"
        >
          {loading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            <Download className="w-4 h-4" />
          )}
          <span>{loading ? 'Starting Export...' : 'Start Export'}</span>
        </button>
      </div>

      {/* Export History */}
      <div className="p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Export History</h4>
        
        {exports.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <Archive className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No exports yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {exports.map((exportItem) => (
              <div key={exportItem.id} className={`border rounded-lg p-3 ${getStatusColor(exportItem.status)}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(exportItem.status)}
                    <div>
                      <p className="font-medium text-sm">
                        {exportItem.exportType.toUpperCase()} Export
                      </p>
                      <p className="text-xs opacity-75">
                        {exportItem.projectIds.length} project(s) • {formatDuration(exportItem.createdAt, exportItem.completedAt)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {exportItem.status === 'completed' && exportItem.downloadUrl && (
                      <a
                        href={exportItem.downloadUrl}
                        download
                        className="flex items-center space-x-1 px-2 py-1 bg-white bg-opacity-60 rounded border hover:bg-opacity-80 transition-colors text-xs"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download</span>
                      </a>
                    )}
                    
                    <button className="flex items-center space-x-1 px-2 py-1 bg-white bg-opacity-60 rounded border hover:bg-opacity-80 transition-colors text-xs">
                      <Eye className="w-3 h-3" />
                      <span>Details</span>
                    </button>
                  </div>
                </div>
                
                {exportItem.status === 'failed' && exportItem.errorMessage && (
                  <div className="mt-2 p-2 bg-red-100 rounded text-xs text-red-700">
                    Error: {exportItem.errorMessage}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
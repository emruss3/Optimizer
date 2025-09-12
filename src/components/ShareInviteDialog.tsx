import React, { useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Share, UserPlus, Copy, Mail, X, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUserRole } from './Guard';

interface ShareInviteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
}

type InviteRole = 'viewer' | 'analyst' | 'manager';

export default function ShareInviteDialog({ isOpen, onClose, projectId, projectName }: ShareInviteDialogProps) {
  const { hasRole } = useUserRole();
  const [activeTab, setActiveTab] = useState<'share' | 'invite'>('share');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteRole>('viewer');
  const [inviteMessage, setInviteMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Generate shareable link
  const shareUrl = `${window.location.origin}/project/${projectId}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      setError('Failed to copy link');
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) {
      setError('Email address is required');
      return;
    }

    if (!hasRole(['manager'])) {
      setError('Only managers and admins can send invites');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Insert project member invitation
      const { error: insertError } = await supabase
        .from('project_members')
        .insert({
          project_id: projectId,
          email: inviteEmail.trim(),
          role: inviteRole,
          invited_by: 'current-user-id', // TODO: Replace with actual user ID
          invited_at: new Date().toISOString(),
          status: 'pending',
          message: inviteMessage.trim() || null
        });

      if (insertError) throw insertError;

      // Send email invitation via edge function
      const { error: emailError } = await supabase.functions.invoke('send-invite', {
        body: {
          email: inviteEmail.trim(),
          projectId,
          projectName,
          role: inviteRole,
          inviteUrl: `${shareUrl}?invite=true`,
          message: inviteMessage.trim()
        }
      });

      if (emailError) {
        console.warn('Email send failed:', emailError);
        // Don't fail the invite if email fails
      }

      setSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      setInviteMessage('');
      setTimeout(() => setSuccess(null), 3000);

    } catch (error) {
      console.error('Invite error:', error);
      setError(`Failed to send invitation: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setInviteEmail('');
    setInviteRole('viewer');
    setInviteMessage('');
    setError(null);
    setSuccess(null);
    setCopied(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Transition show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={React.Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Share className="w-5 h-5" />
                    <span>Share Project</span>
                  </div>
                  <button
                    onClick={handleClose}
                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </Dialog.Title>

                <div className="mt-4">
                  <p className="text-sm text-gray-600">
                    {projectName}
                  </p>
                </div>

                {/* Tab Navigation */}
                <div className="flex mt-4 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setActiveTab('share')}
                    className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeTab === 'share' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                    }`}
                  >
                    <Share className="w-4 h-4" />
                    <span>Share Link</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('invite')}
                    className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeTab === 'invite' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                    }`}
                    disabled={!hasRole(['manager'])}
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Invite</span>
                  </button>
                </div>

                {/* Share Tab */}
                {activeTab === 'share' && (
                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Project Link
                      </label>
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          value={shareUrl}
                          readOnly
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                        />
                        <button
                          onClick={handleCopyLink}
                          className={`px-3 py-2 rounded-lg font-medium transition-colors ${
                            copied 
                              ? 'bg-green-600 text-white' 
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Anyone with this link can view the project
                      </p>
                    </div>

                    <div className="bg-blue-50 p-3 rounded-lg">
                      <h4 className="text-sm font-medium text-blue-900 mb-1">Sharing Permissions</h4>
                      <ul className="text-xs text-blue-700 space-y-1">
                        <li>• Viewers can see parcels and analysis</li>
                        <li>• Link sharing requires no sign-up</li>
                        <li>• Data is read-only for shared viewers</li>
                      </ul>
                    </div>
                  </div>
                )}

                {/* Invite Tab */}
                {activeTab === 'invite' && (
                  <div className="mt-4 space-y-4">
                    {!hasRole(['manager']) ? (
                      <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <AlertCircle className="w-4 h-4 text-yellow-600" />
                          <p className="text-sm text-yellow-800">
                            Only managers and admins can send invitations
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Email Address
                          </label>
                          <input
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder="colleague@company.com"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus-ring"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Role
                          </label>
                          <select
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value as InviteRole)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus-ring"
                          >
                            <option value="viewer">Viewer - Can view only</option>
                            <option value="analyst">Analyst - Can analyze and export</option>
                            <option value="manager">Manager - Can edit and invite</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Message (Optional)
                          </label>
                          <textarea
                            value={inviteMessage}
                            onChange={(e) => setInviteMessage(e.target.value)}
                            placeholder="Add a personal message..."
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus-ring resize-none"
                          />
                        </div>
                      </>
                    )}

                    {error && (
                      <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
                        <p className="text-sm text-red-700">{error}</p>
                      </div>
                    )}

                    {success && (
                      <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
                        <p className="text-sm text-green-700">{success}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                  {activeTab === 'invite' && hasRole(['manager']) && (
                    <button
                      onClick={handleSendInvite}
                      disabled={isLoading || !inviteEmail.trim()}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                    >
                      {isLoading ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      ) : (
                        <Mail className="w-4 h-4" />
                      )}
                      <span>{isLoading ? 'Sending...' : 'Send Invite'}</span>
                    </button>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
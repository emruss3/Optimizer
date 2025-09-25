import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, User, Clock, Circle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUserRole } from './Guard';

interface Comment {
  id: string;
  project_id: string;
  parcel_id: string;
  user_id: string;
  user_name: string;
  message: string;
  created_at: string;
  read_by: string[];
}

interface RealtimeCommentsProps {
  projectId: string;
  parcelId?: string;
  onClose?: () => void;
}

export default function RealtimeComments({ projectId, parcelId, onClose }: RealtimeCommentsProps) {
  const { user } = useUserRole();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const channelRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Unread count for badge
  const unreadCount = comments.filter(comment => 
    !comment.read_by.includes(user.id) && comment.user_id !== user.id
  ).length;

  // Load existing comments
  useEffect(() => {
    loadComments();
  }, [projectId, parcelId]);

  // Setup realtime subscription
  useEffect(() => {
    if (!supabase) return;

    const channelName = parcelId ? `project_${projectId}_parcel_${parcelId}` : `project_${projectId}`;
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_comments',
          filter: `project_id=eq.${projectId}${parcelId ? ` AND parcel_id=eq.${parcelId}` : ''}`
        },
        (payload) => {
          const newComment = payload.new as Comment;
          setComments(prev => [...prev, newComment]);
          
          // Auto-expand if new comment from someone else
          if (newComment.user_id !== user.id) {
            setIsExpanded(true);
          }
          
          // Scroll to bottom
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'project_comments'
        },
        (payload) => {
          const updatedComment = payload.new as Comment;
          setComments(prev =>
            prev.map(comment =>
              comment.id === updatedComment.id ? updatedComment : comment
            )
          );
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [projectId, parcelId, user.id]);

  const loadComments = async () => {
    if (!supabase) return;

    try {
      let query = supabase
        .from('project_comments')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (parcelId) {
        query = query.eq('parcel_id', parcelId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setComments(data || []);
    } catch (error) {
      console.error('Error loading comments:', error);
    }
  };

  const sendComment = async () => {
    if (!newMessage.trim() || !supabase) return;

    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('project_comments')
        .insert({
          project_id: projectId,
          parcel_id: parcelId || null,
          user_id: user.id,
          user_name: user.name,
          message: newMessage.trim(),
          read_by: [user.id] // Mark as read by sender
        });

      if (error) throw error;
      
      setNewMessage('');
    } catch (error) {
      console.error('Error sending comment:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const markAsRead = async (commentId: string) => {
    if (!supabase) return;

    const comment = comments.find(c => c.id === commentId);
    if (!comment || comment.read_by.includes(user.id)) return;

    try {
      const { error } = await supabase
        .from('project_comments')
        .update({
          read_by: [...comment.read_by, user.id]
        })
        .eq('id', commentId);

      if (error) throw error;
    } catch (error) {
      console.error('Error marking comment as read:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      sendComment();
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return `${Math.floor(diffInHours * 60)}m ago`;
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="relative flex items-center space-x-1 px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-full transition-colors"
      >
        <MessageCircle className="w-3 h-3" />
        <span>Comments</span>
        {unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg w-80 max-h-96 flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center space-x-2">
          <MessageCircle className="w-4 h-4" />
          <span>Comments</span>
          {unreadCount > 0 && (
            <div className="w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </div>
          )}
        </h3>
        <button
          onClick={onClose || (() => setIsExpanded(false))}
          className="text-gray-400 hover:text-gray-600"
        >
          ×
        </button>
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {comments.length === 0 ? (
          <div className="text-center text-gray-500 py-6">
            <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No comments yet</p>
            <p className="text-xs">Start the conversation</p>
          </div>
        ) : (
          comments.map((comment) => {
            const isUnread = !comment.read_by.includes(user.id) && comment.user_id !== user.id;
            
            return (
              <div
                key={comment.id}
                className={`p-2 rounded-lg ${
                  comment.user_id === user.id ? 'bg-blue-50 ml-4' : 'bg-gray-50 mr-4'
                } ${isUnread ? 'ring-2 ring-blue-200' : ''}`}
                onClick={() => isUnread && markAsRead(comment.id)}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <User className="w-3 h-3 text-gray-500" />
                  <span className="text-xs font-medium text-gray-700">{comment.user_name}</span>
                  <div className="flex items-center space-x-1 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    <span>{formatTime(comment.created_at)}</span>
                    {isUnread && <Circle className="w-2 h-2 fill-blue-500 text-blue-500" />}
                  </div>
                </div>
                <p className="text-sm text-gray-900">{comment.message}</p>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-200">
        <div className="flex space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Add a comment..."
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus-ring"
            disabled={isLoading}
          />
          <button
            onClick={sendComment}
            disabled={!newMessage.trim() || isLoading}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Press Ctrl+Enter to send
        </p>
      </div>
    </div>
  );
}
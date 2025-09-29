import { useEffect, useCallback } from 'react';
import { useUIStore } from '../store/ui';

interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts() {
  const { 
    setCommandPalette, 
    setFilterModal, 
    setDrawer, 
    openDrawer,
    setCommentsOpen,
    commentsOpen
  } = useUIStore();

  const shortcuts: KeyboardShortcut[] = [
    {
      key: 'k',
      metaKey: true,
      action: () => setCommandPalette(true),
      description: 'Open command palette'
    },
    {
      key: 'f',
      metaKey: true,
      action: () => setFilterModal(true),
      description: 'Open filters'
    },
    {
      key: 'p',
      metaKey: true,
      action: () => setDrawer(openDrawer === 'PROJECT' ? null : 'PROJECT'),
      description: 'Toggle project panel'
    },
    {
      key: 'a',
      metaKey: true,
      action: () => setDrawer(openDrawer === 'UNDERWRITING' ? null : 'UNDERWRITING'),
      description: 'Toggle analysis panel'
    },
    {
      key: 'c',
      metaKey: true,
      action: () => setCommentsOpen(!commentsOpen),
      description: 'Toggle comments'
    },
    {
      key: 'Escape',
      action: () => {
        setCommandPalette(false);
        setFilterModal(false);
        setDrawer(null);
        setCommentsOpen(false);
      },
      description: 'Close all panels'
    }
  ];

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const matchingShortcut = shortcuts.find(shortcut => {
      return (
        shortcut.key === event.key &&
        !!shortcut.ctrlKey === event.ctrlKey &&
        !!shortcut.shiftKey === event.shiftKey &&
        !!shortcut.altKey === event.altKey &&
        !!shortcut.metaKey === event.metaKey
      );
    });

    if (matchingShortcut) {
      event.preventDefault();
      matchingShortcut.action();
    }
  }, [shortcuts]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return shortcuts;
}

// Site Planner specific shortcuts
export function useSitePlannerShortcuts() {
  const shortcuts: KeyboardShortcut[] = [
    {
      key: 'v',
      action: () => console.log('Select tool activated'),
      description: 'Select tool'
    },
    {
      key: 'b',
      action: () => console.log('Building tool activated'),
      description: 'Building tool'
    },
    {
      key: 'p',
      action: () => console.log('Parking tool activated'),
      description: 'Parking tool'
    },
    {
      key: 'g',
      action: () => console.log('Greenspace tool activated'),
      description: 'Greenspace tool'
    },
    {
      key: 'Delete',
      action: () => console.log('Delete selected elements'),
      description: 'Delete selected'
    },
    {
      key: 'c',
      metaKey: true,
      action: () => console.log('Copy selected elements'),
      description: 'Copy selected'
    },
    {
      key: 'v',
      metaKey: true,
      action: () => console.log('Paste elements'),
      description: 'Paste'
    },
    {
      key: 'a',
      metaKey: true,
      action: () => console.log('Select all elements'),
      description: 'Select all'
    },
    {
      key: 'z',
      metaKey: true,
      action: () => console.log('Undo last action'),
      description: 'Undo'
    },
    {
      key: 'y',
      metaKey: true,
      action: () => console.log('Redo last action'),
      description: 'Redo'
    }
  ];

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const matchingShortcut = shortcuts.find(shortcut => {
      return (
        shortcut.key === event.key &&
        !!shortcut.ctrlKey === event.ctrlKey &&
        !!shortcut.shiftKey === event.shiftKey &&
        !!shortcut.altKey === event.altKey &&
        !!shortcut.metaKey === event.metaKey
      );
    });

    if (matchingShortcut) {
      event.preventDefault();
      matchingShortcut.action();
    }
  }, [shortcuts]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return shortcuts;
}

import { useState, useCallback, useRef } from 'react';

interface HistoryState<T> {
  state: T;
  timestamp: number;
  description: string;
}

export function useUndoRedo<T>(
  initialState: T,
  maxHistorySize: number = 50
) {
  const [currentState, setCurrentState] = useState<T>(initialState);
  const [history, setHistory] = useState<HistoryState<T>[]>([
    { state: initialState, timestamp: Date.now(), description: 'Initial state' }
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isUndoRedo, setIsUndoRedo] = useState(false);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const pushState = useCallback((
    newState: T, 
    description: string = 'State change'
  ) => {
    if (isUndoRedo) {
      setIsUndoRedo(false);
      return;
    }

    setCurrentState(newState);
    
    setHistory(prevHistory => {
      const newHistory = prevHistory.slice(0, historyIndex + 1);
      newHistory.push({
        state: newState,
        timestamp: Date.now(),
        description
      });

      // Limit history size
      if (newHistory.length > maxHistorySize) {
        return newHistory.slice(-maxHistorySize);
      }

      return newHistory;
    });

    setHistoryIndex(prevIndex => Math.min(prevIndex + 1, maxHistorySize - 1));
  }, [historyIndex, isUndoRedo, maxHistorySize]);

  const undo = useCallback(() => {
    if (!canUndo) return;

    setIsUndoRedo(true);
    const newIndex = historyIndex - 1;
    const previousState = history[newIndex];
    
    setCurrentState(previousState.state);
    setHistoryIndex(newIndex);
  }, [canUndo, historyIndex, history]);

  const redo = useCallback(() => {
    if (!canRedo) return;

    setIsUndoRedo(true);
    const newIndex = historyIndex + 1;
    const nextState = history[newIndex];
    
    setCurrentState(nextState.state);
    setHistoryIndex(newIndex);
  }, [canRedo, historyIndex, history]);

  const clearHistory = useCallback(() => {
    setHistory([{
      state: currentState,
      timestamp: Date.now(),
      description: 'History cleared'
    }]);
    setHistoryIndex(0);
  }, [currentState]);

  const getHistoryInfo = useCallback(() => {
    return {
      canUndo,
      canRedo,
      historyLength: history.length,
      currentIndex: historyIndex,
      currentDescription: history[historyIndex]?.description,
      previousDescription: history[historyIndex - 1]?.description,
      nextDescription: history[historyIndex + 1]?.description
    };
  }, [canUndo, canRedo, history, historyIndex]);

  return {
    currentState,
    pushState,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
    getHistoryInfo
  };
}

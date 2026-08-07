/**
 * Workspace state + CRUD + persistence (extracted from App.tsx by plan 029).
 * The hook owns the workspaces array, the current-workspace id and their
 * localStorage persistence. Handlers that also touch app-level state
 * (folder selection, file loading) stay in App.tsx and call these functions.
 */
import { useState, useEffect, useCallback } from 'react';
import { Workspace } from '../types/WorkspaceTypes';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { safeGetItem, safeSetItem, safeRemoveItem } from '../utils/storage';

function loadInitialWorkspaces(): Workspace[] {
  const savedWorkspaces = safeGetItem(STORAGE_KEYS.WORKSPACES);
  if (savedWorkspaces) {
    try {
      const parsed = JSON.parse(savedWorkspaces);
      if (Array.isArray(parsed)) {
        console.log(`Initialized workspaces state with ${parsed.length} workspaces`);
        return parsed as Workspace[];
      }
      console.warn('Invalid workspaces data in localStorage (not an array), resetting to empty array');
      safeSetItem(STORAGE_KEYS.WORKSPACES, JSON.stringify([]));
      return [] as Workspace[];
    } catch (error) {
      console.error('Failed to parse workspaces from localStorage during initialization:', error);
      safeSetItem(STORAGE_KEYS.WORKSPACES, JSON.stringify([]));
      return [] as Workspace[];
    }
  }
  console.log('No workspaces found in localStorage, initializing with empty array');
  safeSetItem(STORAGE_KEYS.WORKSPACES, JSON.stringify([]));
  return [] as Workspace[];
}

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(loadInitialWorkspaces);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(() => {
    return safeGetItem(STORAGE_KEYS.CURRENT_WORKSPACE) || null;
  });

  // Persist workspaces when they change
  useEffect(() => {
    if (workspaces) {
      safeSetItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(workspaces));
      console.log(`Workspaces updated: ${workspaces.length} workspaces saved to localStorage`);

      // If we have a current workspace, ensure it still exists in the workspaces array
      if (currentWorkspaceId && !workspaces.some((w: Workspace) => w.id === currentWorkspaceId)) {
        console.log('Current workspace no longer exists, clearing currentWorkspaceId');
        safeRemoveItem(STORAGE_KEYS.CURRENT_WORKSPACE);
        setCurrentWorkspaceId(null);
      }
    }
  }, [workspaces, currentWorkspaceId]);

  /** Creates a workspace, persists it via the effect, and returns it so the
   *  caller can wire up the current-workspace and folder flows. */
  const createWorkspace = useCallback((name: string): Workspace => {
    const newWorkspace: Workspace = {
      id: `workspace-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name,
      folderPath: null,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };
    console.log('App: Creating new workspace with name:', name);
    setWorkspaces((currentWorkspaces: Workspace[]) => {
      console.log('Updating workspaces state, current count:', currentWorkspaces.length);
      const updatedWorkspaces = [...currentWorkspaces, newWorkspace];
      console.log('Saved updated workspaces to localStorage, new count:', updatedWorkspaces.length);
      return updatedWorkspaces;
    });
    return newWorkspace;
  }, []);

  const deleteWorkspace = useCallback((workspaceId: string) => {
    console.log('App: Deleting workspace with ID:', workspaceId);
    setWorkspaces((currentWorkspaces: Workspace[]) => {
      const filteredWorkspaces = currentWorkspaces.filter((w: Workspace) => w.id !== workspaceId);
      console.log(
        `Filtered workspaces: ${currentWorkspaces.length} -> ${filteredWorkspaces.length}`
      );
      console.log('Saved filtered workspaces to localStorage');
      return filteredWorkspaces;
    });
  }, []);

  const updateWorkspaceFolder = useCallback((workspaceId: string, folderPath: string | null) => {
    // (persistence handled by the workspaces effect)
    setWorkspaces((prevWorkspaces: Workspace[]) =>
      prevWorkspaces.map((workspace: Workspace) =>
        workspace.id === workspaceId
          ? { ...workspace, folderPath, lastUsed: Date.now() }
          : workspace
      )
    );
  }, []);

  /** Bumps the last-used timestamp (functional update, no stale reads). */
  const touchWorkspace = useCallback((workspaceId: string) => {
    setWorkspaces((currentWorkspaces: Workspace[]) =>
      currentWorkspaces.map((w: Workspace) =>
        w.id === workspaceId ? { ...w, lastUsed: Date.now() } : w
      )
    );
  }, []);

  /** Re-reads workspaces from localStorage (used when opening the manager). */
  const refreshWorkspacesFromStorage = useCallback(() => {
    const storedWorkspaces = safeGetItem(STORAGE_KEYS.WORKSPACES);
    if (storedWorkspaces) {
      try {
        const parsed = JSON.parse(storedWorkspaces);
        if (Array.isArray(parsed)) {
          setWorkspaces(parsed);
          console.log('Workspaces refreshed from localStorage before opening manager');
        }
      } catch (error) {
        console.error('Failed to parse workspaces from localStorage:', error);
      }
    }
  }, []);

  return {
    workspaces,
    currentWorkspaceId,
    setCurrentWorkspaceId,
    createWorkspace,
    deleteWorkspace,
    updateWorkspaceFolder,
    touchWorkspace,
    refreshWorkspacesFromStorage,
  };
}

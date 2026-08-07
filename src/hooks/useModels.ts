import { useState, useEffect } from 'react';
import { ModelInfo } from '../types/ModelTypes';
import { fetchModels } from '../utils/modelUtils';

/**
 * Custom hook for fetching and managing LLM models
 *
 * @returns {Object} Models state and handlers
 */
export function useModels() {
  const [models, setModels] = useState([] as ModelInfo[]);
  const [selectedModelId, setSelectedModelId] = useState('' as string);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null as string | null);

  // Get the selected model
  const selectedModel = models.find((model: ModelInfo) => model.id === selectedModelId);

  // Load models once on mount (plan 025): selecting a model must not re-fetch.
  useEffect(() => {
    let cancelled = false;

    const loadModels = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const fetchedModels = await fetchModels();

        if (cancelled) return;

        if (fetchedModels && fetchedModels.length > 0) {
          setModels(fetchedModels);

          // Auto-select the first model if none is selected (functional update,
          // so the effect has no dependency on selectedModelId).
          setSelectedModelId((current) => current || fetchedModels[0].id);
        } else {
          setError('Failed to load models');
        }
      } catch (err) {
        if (cancelled) return;
        setError('Error loading models');
        console.error('Error loading models:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadModels();
    return () => {
      cancelled = true;
    };
  }, []);

  // Force reload models
  const refreshModels = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Clear localStorage cache to force a fresh fetch
      localStorage.removeItem('llm-models-cache');
      localStorage.removeItem('llm-models-fetch-time');

      const fetchedModels = await fetchModels();

      if (fetchedModels && fetchedModels.length > 0) {
        setModels(fetchedModels);

        // If the currently selected model is no longer available, select the first one
        if (fetchedModels.findIndex((model) => model.id === selectedModelId) === -1) {
          setSelectedModelId(fetchedModels[0].id);
        }
      } else {
        setError('Failed to load models');
      }
    } catch (err) {
      setError('Error refreshing models');
      console.error('Error refreshing models:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    models,
    selectedModel,
    selectedModelId,
    setSelectedModelId,
    isLoading,
    error,
    refreshModels,
  };
}

import { create } from 'zustand';
import toast from 'react-hot-toast';
import { useAuthStore } from './authStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

/**
 * Global generation store — keeps the SSE connection alive across page
 * navigations so the user can leave the generation screen and come back.
 */
export const useGenerationStore = create((set, get) => ({
  // { [placeId]: { progress, message, status, businessName, sectionPlan, completedSections, currentSection, startTime, error, completed } }
  activeGenerations: {},

  /**
   * Start a new website generation for a business.
   * Opens the SSE stream and keeps it alive in this store.
   */
  startGeneration: (placeId, businessName, token, survey) => {
    const state = get();
    // Don't start if already active for this placeId
    if (state.activeGenerations[placeId] && !state.activeGenerations[placeId].completed && !state.activeGenerations[placeId].error) {
      return;
    }

    set((s) => ({
      activeGenerations: {
        ...s.activeGenerations,
        [placeId]: {
          progress: 0,
          message: 'Initializing AI Core...',
          status: 'Init',
          businessName,
          sectionPlan: [],
          completedSections: [],
          currentSection: null,
          startTime: Date.now(),
          error: null,
          completed: false,
          _abortController: null,
        },
      },
    }));

    const abortController = new AbortController();
    // Store the abort controller
    set((s) => ({
      activeGenerations: {
        ...s.activeGenerations,
        [placeId]: { ...s.activeGenerations[placeId], _abortController: abortController },
      },
    }));

    _runSSE(placeId, token, survey, abortController, set, get);
  },

  /**
   * Reconnect to an ongoing generation (e.g. after page refresh).
   * Uses the GET /generation-subscribe SSE endpoint.
   */
  reconnect: (placeId, token) => {
    const state = get();
    if (state.activeGenerations[placeId] && !state.activeGenerations[placeId].completed && !state.activeGenerations[placeId].error) {
      return; // already connected
    }

    const abortController = new AbortController();

    set((s) => ({
      activeGenerations: {
        ...s.activeGenerations,
        [placeId]: {
          progress: 0,
          message: 'Reconnecting...',
          status: 'Reconnecting',
          businessName: '',
          sectionPlan: [],
          completedSections: [],
          currentSection: null,
          startTime: Date.now(),
          error: null,
          completed: false,
          _abortController: abortController,
        },
      },
    }));

    _runSubscribeSSE(placeId, token, abortController, set, get);
  },

  /**
   * Check server for active generation (used on page load).
   */
  checkStatus: async (placeId) => {
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`${API_BASE}/website/${placeId}/generation-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.active ? data : null;
    } catch {
      return null;
    }
  },

  /**
   * Get generation state for a specific placeId.
   */
  getGeneration: (placeId) => {
    return get().activeGenerations[placeId] || null;
  },

  /**
   * Clear a completed/errored generation from the store.
   */
  clearGeneration: (placeId) => {
    set((s) => {
      const next = { ...s.activeGenerations };
      const gen = next[placeId];
      if (gen?._abortController) {
        try { gen._abortController.abort(); } catch {}
      }
      delete next[placeId];
      return { activeGenerations: next };
    });
  },
}));

// ---- Internal SSE runners (not exported) ----

async function _runSSE(placeId, token, survey, abortController, set, get) {
  try {
    const response = await fetch(`${API_BASE}/website/${placeId}/generate?stream=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ survey }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      let errorMsg = 'Failed to connect to AI generation server.';
      if (response.status === 403) errorMsg = 'AI Quota Exceeded. Please upgrade your plan.';
      if (response.status === 409) errorMsg = 'A website is already being generated for this business. Please wait for it to finish.';
      _updateGen(set, placeId, { error: errorMsg });
      return;
    }

    await _processStream(response, placeId, set, get);
  } catch (err) {
    if (err.name === 'AbortError') return;
    _updateGen(set, placeId, { error: err.message || 'Connection lost.' });
  }
}

async function _runSubscribeSSE(placeId, token, abortController, set, get) {
  try {
    const response = await fetch(`${API_BASE}/website/${placeId}/generation-subscribe`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: abortController.signal,
    });

    if (!response.ok) {
      _updateGen(set, placeId, { error: 'Failed to reconnect.' });
      return;
    }

    // Check if it returned JSON (generation not active) instead of SSE
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      if (!data.active) {
        _updateGen(set, placeId, { error: 'Generation is no longer active.' });
      }
      return;
    }

    await _processStream(response, placeId, set, get);
  } catch (err) {
    if (err.name === 'AbortError') return;
    _updateGen(set, placeId, { error: err.message || 'Reconnection failed.' });
  }
}

async function _processStream(response, placeId, set, get) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n\n');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.replace('data: ', ''));
        if (data.ping) continue;

        if (data.error) {
          _updateGen(set, placeId, { error: data.error });
          return;
        }

        const prev = get().activeGenerations[placeId] || {};
        const updates = {};

        if (data.progress !== undefined) updates.progress = Math.max(prev.progress || 0, data.progress);
        if (data.message) updates.message = data.message;
        if (data.status) updates.status = data.status;
        if (data.sectionPlan) updates.sectionPlan = data.sectionPlan;
        if (data.businessName) updates.businessName = data.businessName;

        // Track completed sections
        if (data.sectionCompleted) {
          const completedSections = [...(prev.completedSections || [])];
          if (!completedSections.includes(data.sectionCompleted)) {
            completedSections.push(data.sectionCompleted);
          }
          updates.completedSections = completedSections;
        }

        // Catch-up: if server sent completedSections directly (reconnection)
        if (data.completedSections) {
          updates.completedSections = data.completedSections;
        }

        if (data.status === 'Done') {
          // Mark all remaining sections as completed
          const plan = updates.sectionPlan || prev.sectionPlan || [];
          const completed = updates.completedSections || prev.completedSections || [];
          updates.completedSections = [...plan]; // all sections are done
          updates.completed = true;
          updates.progress = 100;
          updates.message = 'Website Generation Complete!';
          updates.currentSection = null;

          _updateGen(set, placeId, updates);

          // Fire background toast if user is NOT on the generation page
          if (!window.location.pathname.includes('generate-website')) {
            const name = prev.businessName || updates.businessName || 'Business';
            toast.success(`Website generated for "${name}"`, {
              duration: 8000,
              icon: '🚀',
              style: { background: '#1a1a2e', color: '#fff', border: '1px solid rgba(99,102,241,0.3)' },
            });
          }
          return;
        }

        _updateGen(set, placeId, updates);
      } catch {
        // Ignore parse errors on incomplete chunks
      }
    }
  }
}

function _updateGen(set, placeId, updates) {
  set((s) => ({
    activeGenerations: {
      ...s.activeGenerations,
      [placeId]: {
        ...(s.activeGenerations[placeId] || {}),
        ...updates,
      },
    },
  }));
}

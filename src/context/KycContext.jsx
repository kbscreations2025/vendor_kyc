'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  fetchLinks,
  fetchSubmissions,
  createLinks as apiCreateLinks,
  createSubmission as apiCreateSubmission,
  updateSubmissionStatus as apiUpdateStatus,
  markSubmissionViewed as apiMarkViewed,
} from '@/lib/api';

const KycContext = createContext();

export function KycProvider({ children }) {
  const [links, setLinks] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        const [linksData, subsData] = await Promise.all([
          fetchLinks(),
          fetchSubmissions(),
        ]);
        setLinks(linksData || []);
        setSubmissions(subsData || []);
        setError(null);
      } catch (err) {
        console.error('[KycContext] Failed to load data:', err);
        setError(err.message);
      } finally {
        setLoaded(true);
      }
    }
    loadData();
  }, []);

  const addLinks = useCallback(async (newLinks) => {
    try {
      const created = await apiCreateLinks(newLinks);
      setLinks((prev) => [...prev, ...created]);
      setError(null);
      return created;
    } catch (err) {
      console.error('[KycContext] Failed to create links:', err);
      setError(err.message);
      throw err; // Re-throw so caller can handle UI feedback
    }
  }, []);

  const addSubmission = useCallback(async (submission) => {
    try {
      const created = await apiCreateSubmission(submission);
      setSubmissions((prev) => [...prev, created]);
      setLinks((prev) =>
        prev.map((l) =>
          l.pan === submission.pan ? { ...l, status: 'submitted' } : l
        )
      );
      setError(null);
      return created;
    } catch (err) {
      console.error('[KycContext] Failed to create submission:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  const updateSubmissionStatus = useCallback(async (id, status, comment = '') => {
    try {
      const updated = await apiUpdateStatus(id, status, comment);
      setSubmissions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...updated } : s))
      );
      setError(null);
      return updated;
    } catch (err) {
      console.error('[KycContext] Failed to update status:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  const markAsViewed = useCallback(async (id) => {
    try {
      const updated = await apiMarkViewed(id);
      if (updated) {
        setSubmissions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, ...updated } : s))
        );
      }
      setError(null);
      return updated;
    } catch (err) {
      console.error('[KycContext] Failed to mark as viewed:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  const refreshData = useCallback(async () => {
    try {
      const [linksData, subsData] = await Promise.all([
        fetchLinks(),
        fetchSubmissions(),
      ]);
      setLinks(linksData || []);
      setSubmissions(subsData || []);
      setError(null);
    } catch (err) {
      console.error('[KycContext] Failed to refresh data:', err);
      setError(err.message);
    }
  }, []);

  return (
    <KycContext.Provider
      value={{
        links,
        submissions,
        addLinks,
        addSubmission,
        updateSubmissionStatus,
        markAsViewed,
        refreshData,
        loaded,
        error,
      }}
    >
      {children}
    </KycContext.Provider>
  );
}

export function useKyc() {
  const context = useContext(KycContext);
  if (!context) throw new Error('useKyc must be used within KycProvider');
  return context;
}

'use client';

import { useState, useCallback, useEffect } from 'react';

/**
 * Hook: useToast()
 * Returns { toast, showToast } — render <Toast {...toast} /> in JSX
 *
 * showToast('message')              → info (default)
 * showToast('message', 'success')   → green
 * showToast('message', 'error')     → red
 */
export function useToast(duration = 4000) {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  return { toast, showToast, clearToast };
}

/**
 * Component: <Toast toast={toast} onClose={clearToast} />
 */
export default function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => onClose?.(), 4000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const colors = {
    success: { bg: 'var(--success-light)', border: 'var(--success)', text: 'var(--success)' },
    error: { bg: 'var(--danger-light)', border: 'var(--danger)', text: 'var(--danger)' },
    info: { bg: 'var(--primary-light)', border: 'var(--primary)', text: 'var(--primary)' },
  };

  const c = colors[toast.type] || colors.info;

  return (
    <div
      key={toast.id}
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 10000,
        padding: '12px 20px',
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 'var(--radius)',
        color: c.text,
        fontSize: '14px',
        fontWeight: '500',
        maxWidth: '420px',
        boxShadow: 'var(--shadow-lg)',
        animation: 'slideIn 0.25s ease-out',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => onClose?.()}
        style={{
          background: 'none',
          border: 'none',
          color: c.text,
          cursor: 'pointer',
          fontSize: '16px',
          padding: '0 2px',
          lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  );
}

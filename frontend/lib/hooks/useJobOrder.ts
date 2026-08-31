import { useState, useEffect, useCallback } from 'react';

type JobItem = { id: number; job: any };

export function useJobOrder(jobs: JobItem[], wallet: string, prefix: 'posted' | 'accepted') {
  const storageKey = `stellarwork:job-order:${wallet}:${prefix}`;
  const [order, setOrder] = useState<number[]>([]);

  // Load saved order
  useEffect(() => {
    if (!wallet) return;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) setOrder(arr);
      } catch {}
    } else {
      setOrder(jobs.map(j => j.id));
    }
  }, [wallet, jobs, storageKey]);

  // Sync when job list changes
  useEffect(() => {
    const currentIds = jobs.map(j => j.id);
    const newOrder = order.filter(id => currentIds.includes(id)).concat(currentIds.filter(id => !order.includes(id)));
    if (newOrder.length !== order.length) {
      setOrder(newOrder);
      localStorage.setItem(storageKey, JSON.stringify(newOrder));
    }
  }, [jobs, order, storageKey]);

  const orderedJobs = order.map(id => jobs.find(j => j.id === id)).filter(Boolean) as JobItem[];

  const setNewOrder = useCallback((newOrder: number[]) => {
    setOrder(newOrder);
    localStorage.setItem(storageKey, JSON.stringify(newOrder));
  }, [storageKey]);

  const resetOrder = useCallback(() => {
    const defaultOrder = jobs.map(j => j.id);
    setOrder(defaultOrder);
    localStorage.removeItem(storageKey);
  }, [jobs, storageKey]);

  return { orderedJobs, setOrder: setNewOrder, resetOrder };
}

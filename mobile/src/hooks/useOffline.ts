import { useEffect, useState } from 'react';
import { API_URL } from '../utils/config';

export function useOffline() {
  const [isOffline, setIsOffline] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      if (!mounted) return;
      setIsChecking(true);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${API_URL}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (mounted) setIsOffline(!res.ok);
      } catch {
        if (mounted) setIsOffline(true);
      } finally {
        if (mounted) setIsChecking(false);
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return { isOffline, isChecking };
}

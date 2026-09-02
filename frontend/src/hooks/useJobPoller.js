import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

export function useJobPoller() {
  const [jobId, setJobId]     = useState(null);
  const [status, setStatus]   = useState(null); // waiting | active | completed | failed
  const [progress, setProgress] = useState(0);
  const [position, setPosition] = useState(null);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState('');
  const timerRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => {
    if (!jobId) return;
    timerRef.current = setInterval(async () => {
      try {
        const { data } = await axios.get(`/api/jobs/${jobId}`);
        setStatus(data.status);
        setProgress(data.progress || 0);
        setPosition(data.position || null);
        if (data.status === 'completed') {
          setResult(data.result);
          stopPolling();
        } else if (data.status === 'failed') {
          setError(data.error || 'Job failed');
          stopPolling();
        }
      } catch (err) {
        setError('Lost connection to server — please refresh.');
        stopPolling();
      }
    }, 1500);
    return stopPolling;
  }, [jobId, stopPolling]);

  const startJob = useCallback((id) => {
    stopPolling();
    setJobId(id);
    setStatus('waiting');
    setProgress(0);
    setPosition(null);
    setResult(null);
    setError('');
  }, [stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setJobId(null);
    setStatus(null);
    setProgress(0);
    setPosition(null);
    setResult(null);
    setError('');
  }, [stopPolling]);

  return { startJob, reset, status, progress, position, result, error, jobId };
}

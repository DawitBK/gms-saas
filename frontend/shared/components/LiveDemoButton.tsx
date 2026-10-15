'use client';

import { useState } from 'react';
import { Play, Square } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@shared/lib/api-client';

const isLiveDemoEnabled = process.env.NEXT_PUBLIC_ENABLE_LIVE_DEMO === 'true';

export function LiveDemoButton() {
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  if (!isLiveDemoEnabled) {
    return null;
  }

  const toggleSimulation = async () => {
    setIsLoading(true);
    try {
      if (isRunning) {
        await apiClient.post('/simulation/stop');
        setIsRunning(false);
        toast.success('Simulation Stopped: Live demo mode has been deactivated.');
      } else {
        await apiClient.post('/simulation/start');
        setIsRunning(true);
        toast.success('Simulation Started: System is now running in live demo mode.');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to toggle simulation.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      className={`ui-btn flex items-center gap-2 ${isRunning ? 'ui-btn-danger' : 'ui-btn-primary'}`}
      onClick={toggleSimulation}
      disabled={isLoading}
    >
      {isRunning ? (
        <>
          <Square className="h-4 w-4" />
          Stop Demo
        </>
      ) : (
        <>
          <Play className="h-4 w-4" />
          Run Live Demo
        </>
      )}
    </button>
  );
}

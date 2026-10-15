import { Router } from 'express';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { requireRole } from '../../shared/middleware/rbac.middleware';

const router = Router();

/**
 * Second layer behind the production mount guard in `index.ts`.
 *
 * Every route below spawns a child process holding this backend's full
 * environment, and none of them had any authentication at all — the Swagger
 * annotations advertised `bearerAuth` that the code never enforced. Even on a
 * dev or staging box those secrets are real enough to matter, and the process
 * outlives the request that created it.
 */
router.use(requireAuth, requireRole(['admin']));

let currentSimulationProcess: ChildProcess | null = null;
let currentTrafficProcess: ChildProcess | null = null;

router.post('/start', (req, res) => {
  if (currentSimulationProcess && !currentSimulationProcess.killed) {
    return res.status(400).json({
      success: false,
      message: 'Simulation is already running.',
    });
  }

  const scriptPath = path.resolve(__dirname, '../../../scripts/simulation-engine.js');
  currentSimulationProcess = spawn('node', [scriptPath], {
    env: {
      ...process.env,
      SIMULATION_LIVE_MODE: 'true',
      SIMULATION_TIME_SCALE: '3600',
      SIMULATION_TICK_MS: '500',
      SIMULATION_LIVE_DURATION_HOURS: '1',
    },
    detached: true,
    stdio: 'ignore'
  });

  // Track state in parent process to bypass rate limiters
  process.env.SIMULATION_LIVE_MODE = 'true';

  const trafficPath = path.resolve(__dirname, '../../../scripts/api-traffic-bot.js');
  currentTrafficProcess = spawn('node', [trafficPath], {
    env: { ...process.env },
    detached: true,
    stdio: 'ignore'
  });

  if (currentSimulationProcess) currentSimulationProcess.unref();
  if (currentTrafficProcess) currentTrafficProcess.unref();

  return res.status(200).json({
    success: true,
    data: { message: 'Live demo simulation started.' },
  });
});

router.post('/stop', (req, res) => {
  if (!currentSimulationProcess || currentSimulationProcess.killed) {
    return res.status(400).json({
      success: false,
      message: 'No simulation is currently running.',
    });
  }

  currentSimulationProcess.kill('SIGTERM');
  currentSimulationProcess = null;

  if (currentTrafficProcess && !currentTrafficProcess.killed) {
    currentTrafficProcess.kill('SIGTERM');
  }
  currentTrafficProcess = null;

  process.env.SIMULATION_LIVE_MODE = 'false';

  return res.status(200).json({
    success: true,
    data: { message: 'Live demo simulation stopped.' },
  });
});

router.get('/status', (req, res) => {
  const isRunning = currentSimulationProcess !== null && !currentSimulationProcess.killed;
  return res.status(200).json({
    success: true,
    data: { isRunning },
  });
});

export default router;

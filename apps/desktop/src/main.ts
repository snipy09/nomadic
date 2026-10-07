import { app } from 'electron';
import { spawn } from 'child_process';
import fs from 'fs';
import { startDesktopApp } from '@nomadic/app-core/main/app';
import {
  isSandboxStartupFailure,
  planRelaunch,
  readSandboxFallback,
  shouldRunWithoutSandbox,
  writeSandboxFallback,
} from './sandbox-fallback.js';

/**
 * Nomadic for Windows: the shared desktop app (packages/app-core) with the Windows-only startup rules.
 *
 * - Hardware acceleration and GPU compositing are off: some Windows GPUs/drivers showed a blank or flickering
 *   window with them on.
 * - The Chromium sandbox stays on, except with NOMADIC_DISABLE_SANDBOX=true or after sandboxed processes failed to
 *   start on this machine for this app version (STATUS_DLL_NOT_FOUND, see sandbox-fallback.ts); then the app
 *   restarts once without it (the portable build restarts through its own launcher).
 */
function configureChromium(userDataDir: string): void {
  app.disableHardwareAcceleration();
  if (shouldRunWithoutSandbox(process.env, readSandboxFallback(userDataDir), app.getVersion())) {
    app.commandLine.appendSwitch('no-sandbox');
  } else {
    app.enableSandbox();
    // Renderer failures arrive as 'render-process-gone', other children as 'child-process-gone'.
    let relaunching = false;
    const onProcessGone = (kind: string, exitCode: number) => {
      if (relaunching || !isSandboxStartupFailure(exitCode)) return;
      relaunching = true;
      console.error(`[Startup] ${kind} process could not start under the sandbox; relaunching without it.`);
      writeSandboxFallback(userDataDir, app.getVersion());
      process.env.NOMADIC_DISABLE_SANDBOX = 'true';
      const plan = planRelaunch(process.env, app.getPath('temp'));
      app.releaseSingleInstanceLock();
      if (plan.kind === 'portable') {
        let env = plan.env;
        try {
          fs.mkdirSync(plan.tempDir, { recursive: true });
        } catch {
          env = process.env;
        }
        spawn(plan.file, [], { detached: true, stdio: 'ignore', env }).unref();
      } else {
        app.relaunch(plan.options);
      }
      app.exit(0);
    };
    app.on('child-process-gone', (_event, details) => onProcessGone(details.type, details.exitCode));
    app.on('render-process-gone', (_event, _contents, details) => onProcessGone('Renderer', details.exitCode));
  }
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('disable-gpu-rasterization');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}

startDesktopApp({ id: 'windows', configureChromium, keepRunningWithoutWindows: false });

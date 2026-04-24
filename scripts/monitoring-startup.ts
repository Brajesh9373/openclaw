#!/usr/bin/env node
/**
 * OpenClaw Monitoring Startup Script
 * 
 * Handles automatic startup of monitoring and logging systems
 * Can be called directly or from the gateway plugin
 */

import { spawn, ChildProcess } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

interface StartupConfig {
    enableActivityMonitor: boolean;
    enableLogCollector: boolean;
    enableLogAnalyzer: boolean;
    autoRestartOnFailure: boolean;
    startupDelay: number; // ms
    healthCheckInterval: number; // ms
}

interface ProcessInfo {
    pid: number;
    name: string;
    startTime: number;
    restartCount: number;
}

class MonitoringStartupManager {
    private config: StartupConfig;
    private processes: Map<string, ProcessInfo> = new Map();
    private healthCheckTimer?: NodeJS.Timeout;
    private scriptsDir: string;
    private pidDir: string;

    constructor(config?: Partial<StartupConfig>) {
        this.config = {
            enableActivityMonitor: true,
            enableLogCollector: true,
            enableLogAnalyzer: false, // Don't auto-start analyzer
            autoRestartOnFailure: true,
            startupDelay: 2000, // 2 seconds
            healthCheckInterval: 30000, // 30 seconds
            ...config
        };

        this.scriptsDir = this.findScriptsDirectory();
        this.pidDir = join(homedir(), ".openclaw");

        // Ensure PID directory exists
        if (!existsSync(this.pidDir)) {
            mkdirSync(this.pidDir, { recursive: true });
        }
    }

    private findScriptsDirectory(): string {
        const possiblePaths = [
            join(process.cwd(), "scripts"),
            join(__dirname),
            join(__dirname, "..", "scripts"),
            join(process.env.OPENCLAW_WORKSPACE_DIR || process.cwd(), "scripts")
        ];

        for (const path of possiblePaths) {
            if (existsSync(join(path, "activity-monitor.ts"))) {
                return path;
            }
        }

        return join(process.cwd(), "scripts");
    }

    private getPidFilePath(processName: string): string {
        const pidFileName = processName === "activity-monitor" ? "monitor.pid" :
            processName === "log-collector" ? "log-collector.pid" :
                `${processName}.pid`;
        return join(this.pidDir, pidFileName);
    }

    private isProcessRunning(pid: number): boolean {
        try {
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    }

    private async readExistingPid(processName: string): Promise<number | null> {
        const pidFile = this.getPidFilePath(processName);

        if (!existsSync(pidFile)) {
            return null;
        }

        try {
            const pidStr = readFileSync(pidFile, 'utf8').trim();
            const pid = parseInt(pidStr);

            if (isNaN(pid)) {
                return null;
            }

            if (this.isProcessRunning(pid)) {
                return pid;
            } else {
                // Clean up stale PID file
                require('fs').unlinkSync(pidFile);
                return null;
            }
        } catch {
            return null;
        }
    }

    private writePidFile(processName: string, pid: number): void {
        const pidFile = this.getPidFilePath(processName);
        writeFileSync(pidFile, pid.toString());
    }

    private async startProcess(processName: string, scriptName: string, args: string[] = []): Promise<boolean> {
        // Check if already running
        const existingPid = await this.readExistingPid(processName);
        if (existingPid) {
            console.log(`ℹ️  ${processName} is already running (PID: ${existingPid})`);
            this.processes.set(processName, {
                pid: existingPid,
                name: processName,
                startTime: Date.now(),
                restartCount: 0
            });
            return true;
        }

        const scriptPath = join(this.scriptsDir, scriptName);

        if (!existsSync(scriptPath)) {
            console.error(`❌ Script not found: ${scriptPath}`);
            return false;
        }

        try {
            console.log(`🚀 Starting ${processName}...`);

            const logFile = join(this.pidDir, `${processName}.log`);
            const errorFile = join(this.pidDir, `${processName}.error.log`);

            const child = spawn("node", [scriptPath, ...args], {
                detached: true,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            // Redirect stdout and stderr to log files
            if (child.stdout) {
                const logStream = require('fs').createWriteStream(logFile, { flags: 'a' });
                child.stdout.pipe(logStream);
            }

            if (child.stderr) {
                const errorStream = require('fs').createWriteStream(errorFile, { flags: 'a' });
                child.stderr.pipe(errorStream);
            }

            // Handle process events
            child.on('error', (error) => {
                console.error(`❌ Failed to start ${processName}:`, error);
            });

            child.on('exit', (code, signal) => {
                console.log(`⚠️  ${processName} exited with code ${code}, signal ${signal}`);
                this.processes.delete(processName);

                // Auto-restart if enabled and not a clean exit
                if (this.config.autoRestartOnFailure && code !== 0) {
                    setTimeout(() => {
                        console.log(`🔄 Attempting to restart ${processName}...`);
                        this.startProcess(processName, scriptName, args);
                    }, 5000); // Wait 5 seconds before restart
                }
            });

            // Unref so it doesn't keep parent alive
            child.unref();

            if (child.pid) {
                this.writePidFile(processName, child.pid);

                const processInfo: ProcessInfo = {
                    pid: child.pid,
                    name: processName,
                    startTime: Date.now(),
                    restartCount: 0
                };

                this.processes.set(processName, processInfo);
                console.log(`✅ Started ${processName} (PID: ${child.pid})`);
                console.log(`📝 Logs: ${logFile}`);

                return true;
            } else {
                console.error(`❌ Failed to get PID for ${processName}`);
                return false;
            }
        } catch (error) {
            console.error(`❌ Error starting ${processName}:`, error);
            return false;
        }
    }

    private startHealthCheck(): void {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }

        this.healthCheckTimer = setInterval(() => {
            this.checkProcessHealth();
        }, this.config.healthCheckInterval);
    }

    private checkProcessHealth(): void {
        for (const [name, info] of this.processes) {
            if (!this.isProcessRunning(info.pid)) {
                console.warn(`⚠️  Process ${name} (PID: ${info.pid}) is no longer running`);
                this.processes.delete(name);

                // Try to restart if auto-restart is enabled
                if (this.config.autoRestartOnFailure) {
                    console.log(`🔄 Attempting to restart ${name}...`);

                    if (name === "activity-monitor") {
                        this.startProcess(name, "activity-monitor.ts", ["start"]);
                    } else if (name === "log-collector") {
                        this.startProcess(name, "log-collector.ts", ["start"]);
                    }
                }
            }
        }
    }

    async startAll(): Promise<void> {
        console.log("🔍 OpenClaw Monitoring Startup Manager initializing...");
        console.log(`📁 Scripts directory: ${this.scriptsDir}`);
        console.log(`📁 PID directory: ${this.pidDir}`);

        const startPromises: Promise<boolean>[] = [];

        // Start activity monitor
        if (this.config.enableActivityMonitor) {
            startPromises.push(this.startProcess("activity-monitor", "activity-monitor.ts", ["start"]));
        }

        // Start log collector
        if (this.config.enableLogCollector) {
            startPromises.push(this.startProcess("log-collector", "log-collector.ts", ["start"]));
        }

        // Wait for all processes to start
        const results = await Promise.all(startPromises);
        const successCount = results.filter(Boolean).length;

        console.log(`✅ Started ${successCount}/${results.length} monitoring processes`);

        if (successCount > 0) {
            console.log("📊 Activity data: ~/.openclaw/activity-monitor.json");
            console.log("📝 Collected logs: ~/.openclaw/collected-logs.jsonl");
            console.log("📋 Process logs: ~/.openclaw/*.log");

            // Start health monitoring
            this.startHealthCheck();
        }

        // Add startup delay to let processes initialize
        if (this.config.startupDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.config.startupDelay));
        }
    }

    async stopAll(): Promise<void> {
        console.log("🛑 Stopping all monitoring processes...");

        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = undefined;
        }

        for (const [name, info] of this.processes) {
            try {
                if (this.isProcessRunning(info.pid)) {
                    console.log(`🛑 Stopping ${name} (PID: ${info.pid})...`);
                    process.kill(info.pid, 'SIGTERM');

                    // Wait a bit for graceful shutdown
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // Force kill if still running
                    if (this.isProcessRunning(info.pid)) {
                        console.log(`💀 Force killing ${name} (PID: ${info.pid})...`);
                        process.kill(info.pid, 'SIGKILL');
                    }
                }

                // Clean up PID file
                const pidFile = this.getPidFilePath(name);
                if (existsSync(pidFile)) {
                    require('fs').unlinkSync(pidFile);
                }
            } catch (error) {
                console.error(`❌ Error stopping ${name}:`, error);
            }
        }

        this.processes.clear();
        console.log("✅ All monitoring processes stopped");
    }

    getStatus(): {
        running: number;
        processes: ProcessInfo[];
        config: StartupConfig;
    } {
        // Clean up dead processes
        for (const [name, info] of this.processes) {
            if (!this.isProcessRunning(info.pid)) {
                this.processes.delete(name);
            }
        }

        return {
            running: this.processes.size,
            processes: Array.from(this.processes.values()),
            config: this.config
        };
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const manager = new MonitoringStartupManager();

    switch (command) {
        case 'start':
            manager.startAll().catch(console.error);
            break;

        case 'stop':
            manager.stopAll().catch(console.error);
            break;

        case 'restart':
            manager.stopAll()
                .then(() => new Promise(resolve => setTimeout(resolve, 2000)))
                .then(() => manager.startAll())
                .catch(console.error);
            break;

        case 'status':
            const status = manager.getStatus();
            console.log('📊 Monitoring Status:');
            console.log(`   Running processes: ${status.running}`);
            status.processes.forEach(proc => {
                const uptime = Math.round((Date.now() - proc.startTime) / 1000);
                console.log(`   - ${proc.name} (PID: ${proc.pid}, uptime: ${uptime}s)`);
            });
            break;

        default:
            console.log('OpenClaw Monitoring Startup Manager');
            console.log('Usage:');
            console.log('  node monitoring-startup.ts start    - Start all monitoring processes');
            console.log('  node monitoring-startup.ts stop     - Stop all monitoring processes');
            console.log('  node monitoring-startup.ts restart  - Restart all monitoring processes');
            console.log('  node monitoring-startup.ts status   - Show process status');
            break;
    }
}

export { MonitoringStartupManager };

#!/usr/bin/env node
/**
 * OpenClaw Activity Monitor
 * 
 * Tracks OpenClaw system activity, idle states, and resource usage
 * to help identify when the system is active vs truly idle.
 */

import { spawn, ChildProcess } from "child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

interface ActivitySnapshot {
  timestamp: number;
  gatewayStatus: "running" | "idle" | "error" | "unknown";
  activeSessions: number;
  activeRuns: number;
  memoryUsage: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
  cpuUsage: {
    user: number;
    system: number;
  };
  heartbeatActive: boolean;
  queuedEvents: number;
  lastActivity?: number;
}

interface MonitorConfig {
  interval: number; // monitoring interval in ms
  logPath: string;
  maxLogEntries: number;
  idleThreshold: number; // ms of inactivity to consider idle
  alertOnIdle: boolean;
}

class OpenClawActivityMonitor {
  private config: MonitorConfig;
  private logPath: string;
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private lastCpuUsage = process.cpuUsage();

  constructor(config?: Partial<MonitorConfig>) {
    const defaultConfig: MonitorConfig = {
      interval: 30000, // 30 seconds
      logPath: join(homedir(), ".openclaw", "activity-monitor.json"),
      maxLogEntries: 1000,
      idleThreshold: 300000, // 5 minutes
      alertOnIdle: true,
    };

    this.config = { ...defaultConfig, ...config };
    this.logPath = this.config.logPath;
    
    // Ensure log directory exists
    const logDir = join(this.logPath, "..");
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("Activity monitor is already running");
      return;
    }

    console.log(`Starting OpenClaw activity monitor...`);
    console.log(`Monitoring interval: ${this.config.interval}ms`);
    console.log(`Log path: ${this.logPath}`);
    
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.captureSnapshot().catch(console.error);
    }, this.config.interval);

    // Capture initial snapshot
    await this.captureSnapshot();
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log("Stopping activity monitor...");
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private async captureSnapshot(): Promise<void> {
    try {
      const snapshot = await this.gatherActivityData();
      this.logSnapshot(snapshot);
      this.checkIdleState(snapshot);
    } catch (error) {
      console.error("Error capturing activity snapshot:", error);
    }
  }

  private async gatherActivityData(): Promise<ActivitySnapshot> {
    const timestamp = Date.now();
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage(this.lastCpuUsage);
    this.lastCpuUsage = process.cpuUsage();

    // Try to get OpenClaw gateway status
    const gatewayInfo = await this.getGatewayStatus();
    
    return {
      timestamp,
      gatewayStatus: gatewayInfo.status,
      activeSessions: gatewayInfo.sessions,
      activeRuns: gatewayInfo.runs,
      memoryUsage: {
        rss: memoryUsage.rss,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
      },
      cpuUsage: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      heartbeatActive: gatewayInfo.heartbeatActive,
      queuedEvents: gatewayInfo.queuedEvents,
      lastActivity: gatewayInfo.lastActivity,
    };
  }

  private async getGatewayStatus(): Promise<{
    status: "running" | "idle" | "error" | "unknown";
    sessions: number;
    runs: number;
    heartbeatActive: boolean;
    queuedEvents: number;
    lastActivity?: number;
  }> {
    try {
      // Try to call OpenClaw status command
      const statusResult = await this.executeCommand("openclaw", ["gateway", "status", "--json"]);
      
      if (statusResult.success && statusResult.stdout) {
        const status = JSON.parse(statusResult.stdout);
        return {
          status: this.determineGatewayStatus(status),
          sessions: status.sessions?.count || 0,
          runs: this.countActiveRuns(status),
          heartbeatActive: this.isHeartbeatActive(status),
          queuedEvents: status.queuedSystemEvents?.length || 0,
          lastActivity: this.getLastActivityTime(status),
        };
      }
    } catch (error) {
      // Gateway might not be running or accessible
    }

    // Fallback: check if OpenClaw processes are running
    const processCheck = await this.checkOpenClawProcesses();
    return {
      status: processCheck.found ? "unknown" : "error",
      sessions: 0,
      runs: 0,
      heartbeatActive: false,
      queuedEvents: 0,
    };
  }

  private determineGatewayStatus(status: any): "running" | "idle" | "error" | "unknown" {
    if (!status) return "error";
    
    const activeSessions = status.sessions?.count || 0;
    const queuedEvents = status.queuedSystemEvents?.length || 0;
    const recentActivity = status.sessions?.recent?.length || 0;
    
    if (activeSessions > 0 || queuedEvents > 0 || recentActivity > 0) {
      return "running";
    }
    
    return "idle";
  }

  private countActiveRuns(status: any): number {
    // Count active runs from session data
    const recent = status.sessions?.recent || [];
    return recent.filter((session: any) => 
      session.age && session.age < this.config.idleThreshold
    ).length;
  }

  private isHeartbeatActive(status: any): boolean {
    const heartbeat = status.heartbeat;
    if (!heartbeat || !Array.isArray(heartbeat.agents)) {
      return false;
    }
    
    return heartbeat.agents.some((agent: any) => agent.enabled);
  }

  private getLastActivityTime(status: any): number | undefined {
    const recent = status.sessions?.recent || [];
    if (recent.length === 0) return undefined;
    
    const mostRecent = recent.reduce((latest: any, session: any) => {
      if (!latest || (session.age && session.age < latest.age)) {
        return session;
      }
      return latest;
    });
    
    return mostRecent?.age ? Date.now() - mostRecent.age : undefined;
  }

  private async checkOpenClawProcesses(): Promise<{ found: boolean; count: number }> {
    try {
      const result = await this.executeCommand("pgrep", ["-f", "openclaw"]);
      const processes = result.stdout.trim().split('\n').filter(Boolean);
      return {
        found: processes.length > 0,
        count: processes.length,
      };
    } catch {
      return { found: false, count: 0 };
    }
  }

  private async executeCommand(command: string, args: string[]): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve) => {
      const child = spawn(command, args, { stdio: 'pipe' });
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          stdout,
          stderr,
        });
      });

      child.on('error', () => {
        resolve({
          success: false,
          stdout,
          stderr,
        });
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        child.kill();
        resolve({
          success: false,
          stdout,
          stderr: stderr + '\nCommand timed out',
        });
      }, 10000);
    });
  }

  private logSnapshot(snapshot: ActivitySnapshot): void {
    try {
      let logs: ActivitySnapshot[] = [];
      
      if (existsSync(this.logPath)) {
        const content = readFileSync(this.logPath, 'utf8');
        logs = JSON.parse(content);
      }

      logs.push(snapshot);

      // Keep only the most recent entries
      if (logs.length > this.config.maxLogEntries) {
        logs = logs.slice(-this.config.maxLogEntries);
      }

      writeFileSync(this.logPath, JSON.stringify(logs, null, 2));
    } catch (error) {
      console.error("Error writing activity log:", error);
    }
  }

  private checkIdleState(snapshot: ActivitySnapshot): void {
    if (!this.config.alertOnIdle) return;

    const isIdle = snapshot.gatewayStatus === "idle" && 
                   snapshot.activeSessions === 0 && 
                   snapshot.activeRuns === 0;

    if (isIdle) {
      const idleDuration = snapshot.lastActivity ? 
        Date.now() - snapshot.lastActivity : 
        this.config.idleThreshold + 1;

      if (idleDuration > this.config.idleThreshold) {
        console.log(`⚠️  OpenClaw has been idle for ${Math.round(idleDuration / 1000)}s`);
        console.log(`   Memory usage: ${Math.round(snapshot.memoryUsage.rss / 1024 / 1024)}MB RSS`);
        console.log(`   CPU usage: ${snapshot.cpuUsage.user + snapshot.cpuUsage.system}μs`);
      }
    }
  }

  // Public methods for querying activity data
  getRecentActivity(minutes: number = 60): ActivitySnapshot[] {
    try {
      if (!existsSync(this.logPath)) return [];
      
      const content = readFileSync(this.logPath, 'utf8');
      const logs: ActivitySnapshot[] = JSON.parse(content);
      
      const cutoff = Date.now() - (minutes * 60 * 1000);
      return logs.filter(log => log.timestamp > cutoff);
    } catch {
      return [];
    }
  }

  getCurrentStatus(): string {
    const recent = this.getRecentActivity(5);
    if (recent.length === 0) {
      return "No recent activity data available";
    }

    const latest = recent[recent.length - 1];
    const age = Math.round((Date.now() - latest.timestamp) / 1000);
    
    return `Status: ${latest.gatewayStatus} (${age}s ago) | ` +
           `Sessions: ${latest.activeSessions} | ` +
           `Memory: ${Math.round(latest.memoryUsage.rss / 1024 / 1024)}MB | ` +
           `Heartbeat: ${latest.heartbeatActive ? 'active' : 'inactive'}`;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const monitor = new OpenClawActivityMonitor();

  switch (command) {
    case 'start':
      monitor.start().catch(console.error);
      
      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log('\nReceived SIGINT, stopping monitor...');
        monitor.stop();
        process.exit(0);
      });
      
      process.on('SIGTERM', () => {
        console.log('\nReceived SIGTERM, stopping monitor...');
        monitor.stop();
        process.exit(0);
      });
      break;

    case 'status':
      console.log(monitor.getCurrentStatus());
      break;

    case 'recent':
      const minutes = parseInt(args[1]) || 60;
      const activity = monitor.getRecentActivity(minutes);
      console.log(`Activity in last ${minutes} minutes:`);
      activity.forEach(snapshot => {
        const time = new Date(snapshot.timestamp).toLocaleTimeString();
        console.log(`${time}: ${snapshot.gatewayStatus} (${snapshot.activeSessions} sessions)`);
      });
      break;

    default:
      console.log('OpenClaw Activity Monitor');
      console.log('Usage:');
      console.log('  node activity-monitor.ts start   - Start monitoring');
      console.log('  node activity-monitor.ts status  - Show current status');
      console.log('  node activity-monitor.ts recent [minutes] - Show recent activity');
      break;
  }
}

export { OpenClawActivityMonitor, ActivitySnapshot, MonitorConfig };

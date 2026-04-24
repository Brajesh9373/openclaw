#!/usr/bin/env node
/**
 * OpenClaw Activity Dashboard
 * 
 * Provides a real-time dashboard view of OpenClaw activity and system status
 */

import { readFileSync, existsSync } from "fs";
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

class ActivityDashboard {
    private logPath: string;

    constructor() {
        this.logPath = join(homedir(), ".openclaw", "activity-monitor.json");
    }

    private loadActivityData(): ActivitySnapshot[] {
        try {
            if (!existsSync(this.logPath)) {
                return [];
            }

            const content = readFileSync(this.logPath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error("Error loading activity data:", error);
            return [];
        }
    }

    private formatBytes(bytes: number): string {
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(1)}MB`;
    }

    private formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    private getStatusIcon(status: string): string {
        switch (status) {
            case "running": return "🟢";
            case "idle": return "🟡";
            case "error": return "🔴";
            default: return "⚪";
        }
    }

    showCurrentStatus(): void {
        const data = this.loadActivityData();

        if (data.length === 0) {
            console.log("❌ No activity data available. Make sure the activity monitor is running.");
            console.log("   Start it with: node scripts/activity-monitor.ts start");
            return;
        }

        const latest = data[data.length - 1];
        const age = Date.now() - latest.timestamp;

        console.log("┌─────────────────────────────────────────────────────────────┐");
        console.log("│                    OpenClaw Activity Status                 │");
        console.log("├─────────────────────────────────────────────────────────────┤");
        console.log(`│ Status: ${this.getStatusIcon(latest.gatewayStatus)} ${latest.gatewayStatus.toUpperCase().padEnd(8)} │ Last Update: ${this.formatDuration(age)} ago │`);
        console.log(`│ Active Sessions: ${latest.activeSessions.toString().padEnd(3)} │ Active Runs: ${latest.activeRuns.toString().padEnd(3)}        │`);
        console.log(`│ Memory Usage: ${this.formatBytes(latest.memoryUsage.rss).padEnd(8)} │ Heap: ${this.formatBytes(latest.memoryUsage.heapUsed).padEnd(8)}     │`);
        console.log(`│ Heartbeat: ${(latest.heartbeatActive ? "Active" : "Inactive").padEnd(8)} │ Queued Events: ${latest.queuedEvents.toString().padEnd(3)}    │`);

        if (latest.lastActivity) {
            const activityAge = Date.now() - latest.lastActivity;
            console.log(`│ Last Activity: ${this.formatDuration(activityAge).padEnd(8)} ago                        │`);
        }

        console.log("└─────────────────────────────────────────────────────────────┘");
    }

    showActivityHistory(hours: number = 24): void {
        const data = this.loadActivityData();
        const cutoff = Date.now() - (hours * 60 * 60 * 1000);
        const filtered = data.filter(d => d.timestamp > cutoff);

        if (filtered.length === 0) {
            console.log(`No activity data in the last ${hours} hours`);
            return;
        }

        console.log(`\n📊 Activity History (Last ${hours} hours)`);
        console.log("─".repeat(80));

        // Group by hour for summary
        const hourlyStats = new Map<string, {
            running: number;
            idle: number;
            error: number;
            unknown: number;
            maxSessions: number;
            maxMemory: number;
        }>();

        filtered.forEach(snapshot => {
            const hour = new Date(snapshot.timestamp).toISOString().slice(0, 13);
            const stats = hourlyStats.get(hour) || {
                running: 0, idle: 0, error: 0, unknown: 0, maxSessions: 0, maxMemory: 0
            };

            stats[snapshot.gatewayStatus as keyof typeof stats]++;
            stats.maxSessions = Math.max(stats.maxSessions, snapshot.activeSessions);
            stats.maxMemory = Math.max(stats.maxMemory, snapshot.memoryUsage.rss);

            hourlyStats.set(hour, stats);
        });

        // Display hourly summary
        for (const [hour, stats] of hourlyStats) {
            const time = new Date(hour + ":00:00Z").toLocaleString();
            const total = stats.running + stats.idle + stats.error + stats.unknown;
            const runningPct = Math.round((stats.running / total) * 100);
            const idlePct = Math.round((stats.idle / total) * 100);

            console.log(`${time}: ${this.getStatusIcon("running")}${runningPct}% ${this.getStatusIcon("idle")}${idlePct}% | Max Sessions: ${stats.maxSessions} | Peak Memory: ${this.formatBytes(stats.maxMemory)}`);
        }
    }

    showIdleAnalysis(): void {
        const data = this.loadActivityData();

        if (data.length === 0) {
            console.log("No data available for idle analysis");
            return;
        }

        console.log("\n🔍 Idle State Analysis");
        console.log("─".repeat(50));

        let idlePeriods: { start: number; end: number; duration: number }[] = [];
        let currentIdleStart: number | null = null;

        data.forEach((snapshot, index) => {
            const isIdle = snapshot.gatewayStatus === "idle" &&
                snapshot.activeSessions === 0 &&
                snapshot.activeRuns === 0;

            if (isIdle && currentIdleStart === null) {
                currentIdleStart = snapshot.timestamp;
            } else if (!isIdle && currentIdleStart !== null) {
                idlePeriods.push({
                    start: currentIdleStart,
                    end: snapshot.timestamp,
                    duration: snapshot.timestamp - currentIdleStart
                });
                currentIdleStart = null;
            }
        });

        // Handle ongoing idle period
        if (currentIdleStart !== null) {
            idlePeriods.push({
                start: currentIdleStart,
                end: Date.now(),
                duration: Date.now() - currentIdleStart
            });
        }

        if (idlePeriods.length === 0) {
            console.log("✅ No significant idle periods detected");
            return;
        }

        console.log(`Found ${idlePeriods.length} idle periods:`);

        idlePeriods
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 10) // Show top 10 longest idle periods
            .forEach((period, index) => {
                const start = new Date(period.start).toLocaleString();
                const duration = this.formatDuration(period.duration);
                const isOngoing = period.end === Date.now() ? " (ongoing)" : "";

                console.log(`${index + 1}. ${start} - ${duration}${isOngoing}`);
            });

        // Calculate idle statistics
        const totalIdleTime = idlePeriods.reduce((sum, period) => sum + period.duration, 0);
        const totalTime = data.length > 0 ? data[data.length - 1].timestamp - data[0].timestamp : 0;
        const idlePercentage = totalTime > 0 ? (totalIdleTime / totalTime) * 100 : 0;

        console.log(`\n📈 Idle Statistics:`);
        console.log(`   Total idle time: ${this.formatDuration(totalIdleTime)}`);
        console.log(`   Idle percentage: ${idlePercentage.toFixed(1)}%`);
        console.log(`   Average idle duration: ${this.formatDuration(totalIdleTime / idlePeriods.length)}`);
    }

    showResourceUsage(): void {
        const data = this.loadActivityData();

        if (data.length === 0) {
            console.log("No data available for resource analysis");
            return;
        }

        console.log("\n💾 Resource Usage Analysis");
        console.log("─".repeat(50));

        const recent = data.slice(-20); // Last 20 snapshots

        const memoryStats = {
            min: Math.min(...recent.map(d => d.memoryUsage.rss)),
            max: Math.max(...recent.map(d => d.memoryUsage.rss)),
            avg: recent.reduce((sum, d) => sum + d.memoryUsage.rss, 0) / recent.length
        };

        const heapStats = {
            min: Math.min(...recent.map(d => d.memoryUsage.heapUsed)),
            max: Math.max(...recent.map(d => d.memoryUsage.heapUsed)),
            avg: recent.reduce((sum, d) => sum + d.memoryUsage.heapUsed, 0) / recent.length
        };

        console.log("Memory Usage (RSS):");
        console.log(`  Min: ${this.formatBytes(memoryStats.min)}`);
        console.log(`  Max: ${this.formatBytes(memoryStats.max)}`);
        console.log(`  Avg: ${this.formatBytes(memoryStats.avg)}`);

        console.log("\nHeap Usage:");
        console.log(`  Min: ${this.formatBytes(heapStats.min)}`);
        console.log(`  Max: ${this.formatBytes(heapStats.max)}`);
        console.log(`  Avg: ${this.formatBytes(heapStats.avg)}`);

        // Memory trend
        if (recent.length >= 10) {
            const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
            const secondHalf = recent.slice(Math.floor(recent.length / 2));

            const firstAvg = firstHalf.reduce((sum, d) => sum + d.memoryUsage.rss, 0) / firstHalf.length;
            const secondAvg = secondHalf.reduce((sum, d) => sum + d.memoryUsage.rss, 0) / secondHalf.length;

            const trend = secondAvg > firstAvg ? "📈 Increasing" : "📉 Decreasing";
            const change = Math.abs(secondAvg - firstAvg);

            console.log(`\nMemory Trend: ${trend} (${this.formatBytes(change)} change)`);
        }
    }

    watchLive(): void {
        console.log("🔴 Live Activity Monitor (Press Ctrl+C to exit)");
        console.log("─".repeat(60));

        const updateDisplay = () => {
            // Clear screen
            process.stdout.write('\x1B[2J\x1B[0f');

            console.log("🔴 OpenClaw Live Activity Monitor");
            console.log(`Updated: ${new Date().toLocaleTimeString()}`);
            console.log("─".repeat(60));

            this.showCurrentStatus();
        };

        // Initial display
        updateDisplay();

        // Update every 5 seconds
        const interval = setInterval(updateDisplay, 5000);

        // Handle Ctrl+C
        process.on('SIGINT', () => {
            clearInterval(interval);
            console.log('\n\n👋 Live monitor stopped');
            process.exit(0);
        });
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const dashboard = new ActivityDashboard();

    switch (command) {
        case 'status':
            dashboard.showCurrentStatus();
            break;

        case 'history':
            const hours = parseInt(args[1]) || 24;
            dashboard.showActivityHistory(hours);
            break;

        case 'idle':
            dashboard.showIdleAnalysis();
            break;

        case 'resources':
            dashboard.showResourceUsage();
            break;

        case 'live':
            dashboard.watchLive();
            break;

        case 'full':
            dashboard.showCurrentStatus();
            dashboard.showActivityHistory(12);
            dashboard.showIdleAnalysis();
            dashboard.showResourceUsage();
            break;

        default:
            console.log('OpenClaw Activity Dashboard');
            console.log('Usage:');
            console.log('  node activity-dashboard.ts status     - Show current status');
            console.log('  node activity-dashboard.ts history [hours] - Show activity history');
            console.log('  node activity-dashboard.ts idle       - Analyze idle periods');
            console.log('  node activity-dashboard.ts resources  - Show resource usage');
            console.log('  node activity-dashboard.ts live       - Live monitoring view');
            console.log('  node activity-dashboard.ts full       - Show all information');
            break;
    }
}

export { ActivityDashboard };

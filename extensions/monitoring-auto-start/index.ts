/**
 * OpenClaw Monitoring Auto-Start Plugin
 * 
 * Automatically starts activity monitoring and log collection when the gateway starts
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import type { PluginHookGatewayStartEvent, PluginHookGatewayContext } from "../../src/plugins/hook-types.js";

class MonitoringAutoStart {
    private scriptsDir: string;

    constructor() {
        this.scriptsDir = this.findScriptsDirectory();
    }

    private findScriptsDirectory(): string {
        // Try different possible locations for the scripts directory
        const possiblePaths = [
            join(process.cwd(), "scripts"),
            join(__dirname, "..", "..", "scripts"),
            join(process.env.OPENCLAW_WORKSPACE_DIR || process.cwd(), "scripts")
        ];

        for (const path of possiblePaths) {
            if (existsSync(join(path, "monitoring-startup.ts"))) {
                return path;
            }
        }

        // Fallback to check for individual scripts
        for (const path of possiblePaths) {
            if (existsSync(join(path, "activity-monitor.ts"))) {
                return path;
            }
        }

        return join(process.cwd(), "scripts");
    }

    private async executeStartupScript(): Promise<boolean> {
        const startupScript = join(this.scriptsDir, "monitoring-startup.ts");

        if (existsSync(startupScript)) {
            return this.runScript(startupScript, ["start"]);
        } else {
            // Fallback to individual scripts
            console.log("📝 Using individual monitoring scripts...");
            return this.startIndividualScripts();
        }
    }

    private async runScript(scriptPath: string, args: string[]): Promise<boolean> {
        return new Promise((resolve) => {
            console.log(`🚀 Executing: node ${scriptPath} ${args.join(' ')}`);

            const child = spawn("node", [scriptPath, ...args], {
                stdio: 'inherit',
                cwd: process.cwd()
            });

            child.on('close', (code) => {
                if (code === 0) {
                    console.log(`✅ Monitoring startup completed successfully`);
                    resolve(true);
                } else {
                    console.error(`❌ Monitoring startup failed with code ${code}`);
                    resolve(false);
                }
            });

            child.on('error', (error) => {
                console.error(`❌ Failed to execute monitoring startup:`, error);
                resolve(false);
            });

            // Set a timeout to prevent hanging
            setTimeout(() => {
                child.kill();
                console.log("⏰ Monitoring startup timed out, but processes may still be starting in background");
                resolve(true); // Consider it successful since processes are detached
            }, 10000); // 10 second timeout
        });
    }

    private async startIndividualScripts(): Promise<boolean> {
        const scripts = [
            { name: "activity-monitor.ts", args: ["start"] },
            { name: "log-collector.ts", args: ["start"] }
        ];

        let successCount = 0;

        for (const script of scripts) {
            const scriptPath = join(this.scriptsDir, script.name);

            if (existsSync(scriptPath)) {
                try {
                    console.log(`🚀 Starting ${script.name}...`);

                    const child = spawn("node", [scriptPath, ...script.args], {
                        detached: true,
                        stdio: 'ignore'
                    });

                    child.unref();

                    if (child.pid) {
                        console.log(`✅ Started ${script.name} (PID: ${child.pid})`);
                        successCount++;
                    }
                } catch (error) {
                    console.error(`❌ Failed to start ${script.name}:`, error);
                }
            } else {
                console.warn(`⚠️  Script not found: ${scriptPath}`);
            }
        }

        return successCount > 0;
    }

    async startMonitoring(context: PluginHookGatewayContext): Promise<void> {
        console.log("🔍 OpenClaw Monitoring Auto-Start initializing...");
        console.log(`📁 Scripts directory: ${this.scriptsDir}`);
        console.log(`🚪 Gateway port: ${context.port}`);

        try {
            const success = await this.executeStartupScript();

            if (success) {
                console.log("✅ Monitoring systems started successfully");
                console.log("📊 Activity monitoring: ~/.openclaw/activity-monitor.json");
                console.log("📝 Log collection: ~/.openclaw/collected-logs.jsonl");
                console.log("📋 Process logs: ~/.openclaw/*.log");
                console.log("");
                console.log("💡 Use these commands to manage monitoring:");
                console.log("   ./scripts/openclaw-monitor.sh status     # Check status");
                console.log("   ./scripts/openclaw-monitor.sh dashboard  # View dashboard");
                console.log("   ./scripts/openclaw-monitor.sh show-logs  # View recent logs");
            } else {
                console.warn("⚠️  Some monitoring systems may not have started properly");
                console.log("💡 You can manually start monitoring with:");
                console.log("   ./scripts/openclaw-monitor.sh start");
                console.log("   ./scripts/openclaw-monitor.sh log-start");
            }
        } catch (error) {
            console.error("❌ Error during monitoring startup:", error);
            console.log("💡 Try starting monitoring manually:");
            console.log("   ./scripts/openclaw-monitor.sh start");
            console.log("   ./scripts/openclaw-monitor.sh log-start");
        }
    }
}

// Global instance
const monitoringAutoStart = new MonitoringAutoStart();

// Gateway start hook handler
export async function gateway_start(
    event: PluginHookGatewayStartEvent,
    context: PluginHookGatewayContext
): Promise<void> {
    // Add a small delay to let the gateway fully initialize
    setTimeout(async () => {
        try {
            await monitoringAutoStart.startMonitoring(context);
        } catch (error) {
            console.error("❌ Failed to start monitoring systems:", error);
        }
    }, 3000); // 3 second delay
}

// Export for potential external use
export { monitoringAutoStart };

// Plugin metadata
export const plugin = {
    id: "monitoring-auto-start",
    name: "Monitoring Auto-Start",
    description: "Automatically starts activity monitoring and log collection when OpenClaw gateway starts",
    version: "1.0.0",
    hooks: {
        gateway_start
    }
};

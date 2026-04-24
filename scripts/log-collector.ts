#!/usr/bin/env node
/**
 * OpenClaw Log Collector
 * 
 * Collects, aggregates, and analyzes OpenClaw logs from various sources
 */

import { spawn, ChildProcess } from "child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";

interface LogEntry {
    timestamp: number;
    level: "debug" | "info" | "warn" | "error" | "trace";
    source: string;
    message: string;
    context?: Record<string, any>;
    sessionKey?: string;
    agentId?: string;
}

interface LogSource {
    name: string;
    path: string;
    type: "file" | "command" | "journal";
    pattern?: RegExp;
    enabled: boolean;
}

interface LogCollectorConfig {
    outputPath: string;
    maxLogSize: number; // Max size in bytes before rotation
    maxLogFiles: number; // Max number of rotated files to keep
    collectInterval: number; // Collection interval in ms
    logSources: LogSource[];
    filters: {
        minLevel: string;
        includePatterns: string[];
        excludePatterns: string[];
    };
}

class OpenClawLogCollector {
    private config: LogCollectorConfig;
    private isRunning = false;
    private intervalId?: NodeJS.Timeout;
    private logBuffer: LogEntry[] = [];

    constructor(config?: Partial<LogCollectorConfig>) {
        const defaultConfig: LogCollectorConfig = {
            outputPath: join(homedir(), ".openclaw", "collected-logs.jsonl"),
            maxLogSize: 50 * 1024 * 1024, // 50MB
            maxLogFiles: 10,
            collectInterval: 10000, // 10 seconds
            logSources: this.getDefaultLogSources(),
            filters: {
                minLevel: "info",
                includePatterns: [],
                excludePatterns: ["heartbeat-noise", "routine-check"]
            }
        };

        this.config = { ...defaultConfig, ...config };

        // Ensure log directory exists
        const logDir = join(this.config.outputPath, "..");
        if (!existsSync(logDir)) {
            mkdirSync(logDir, { recursive: true });
        }
    }

    private getDefaultLogSources(): LogSource[] {
        const homeDir = homedir();
        const sources: LogSource[] = [
            {
                name: "openclaw-gateway",
                path: join(homeDir, ".openclaw", "logs", "gateway.log"),
                type: "file",
                enabled: true
            },
            {
                name: "openclaw-agents",
                path: join(homeDir, ".openclaw", "logs", "agents.log"),
                type: "file",
                enabled: true
            },
            {
                name: "openclaw-sessions",
                path: join(homeDir, ".openclaw", "logs", "sessions.log"),
                type: "file",
                enabled: true
            },
            {
                name: "openclaw-errors",
                path: join(homeDir, ".openclaw", "logs", "errors.log"),
                type: "file",
                enabled: true
            },
            {
                name: "openclaw-cli",
                path: "openclaw logs --json --tail 100",
                type: "command",
                enabled: true
            },
            {
                name: "system-journal",
                path: "journalctl -u openclaw --no-pager -n 50 -o json",
                type: "journal",
                enabled: false // Disabled by default, enable if using systemd
            }
        ];

        return sources;
    }

    async start(): Promise<void> {
        if (this.isRunning) {
            console.log("Log collector is already running");
            return;
        }

        console.log("🚀 Starting OpenClaw log collector...");
        console.log(`Collection interval: ${this.config.collectInterval}ms`);
        console.log(`Output: ${this.config.outputPath}`);

        this.isRunning = true;

        // Initial collection
        await this.collectLogs();

        // Set up periodic collection
        this.intervalId = setInterval(() => {
            this.collectLogs().catch(console.error);
        }, this.config.collectInterval);
    }

    stop(): void {
        if (!this.isRunning) {
            return;
        }

        console.log("🛑 Stopping log collector...");
        this.isRunning = false;

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }

        // Flush any remaining logs
        if (this.logBuffer.length > 0) {
            this.flushLogs();
        }
    }

    private async collectLogs(): Promise<void> {
        const timestamp = Date.now();

        for (const source of this.config.logSources) {
            if (!source.enabled) continue;

            try {
                const entries = await this.collectFromSource(source, timestamp);
                this.logBuffer.push(...entries);
            } catch (error) {
                console.error(`Error collecting from ${source.name}:`, error);
            }
        }

        // Flush logs if buffer is getting large
        if (this.logBuffer.length > 1000) {
            this.flushLogs();
        }
    }

    private async collectFromSource(source: LogSource, timestamp: number): Promise<LogEntry[]> {
        switch (source.type) {
            case "file":
                return this.collectFromFile(source, timestamp);
            case "command":
                return this.collectFromCommand(source, timestamp);
            case "journal":
                return this.collectFromJournal(source, timestamp);
            default:
                return [];
        }
    }

    private async collectFromFile(source: LogSource, timestamp: number): Promise<LogEntry[]> {
        if (!existsSync(source.path)) {
            return [];
        }

        try {
            const content = readFileSync(source.path, 'utf8');
            const lines = content.split('\n').filter(Boolean);

            return lines
                .slice(-100) // Get last 100 lines to avoid processing entire file each time
                .map(line => this.parseLogLine(line, source.name, timestamp))
                .filter(Boolean) as LogEntry[];
        } catch (error) {
            console.error(`Error reading ${source.path}:`, error);
            return [];
        }
    }

    private async collectFromCommand(source: LogSource, timestamp: number): Promise<LogEntry[]> {
        try {
            const result = await this.executeCommand(source.path);
            if (!result.success) {
                return [];
            }

            const lines = result.stdout.split('\n').filter(Boolean);
            return lines
                .map(line => this.parseLogLine(line, source.name, timestamp))
                .filter(Boolean) as LogEntry[];
        } catch (error) {
            console.error(`Error executing command for ${source.name}:`, error);
            return [];
        }
    }

    private async collectFromJournal(source: LogSource, timestamp: number): Promise<LogEntry[]> {
        try {
            const result = await this.executeCommand(source.path);
            if (!result.success) {
                return [];
            }

            const lines = result.stdout.split('\n').filter(Boolean);
            return lines
                .map(line => {
                    try {
                        const journalEntry = JSON.parse(line);
                        return {
                            timestamp: new Date(journalEntry.__REALTIME_TIMESTAMP / 1000).getTime(),
                            level: this.mapJournalPriority(journalEntry.PRIORITY),
                            source: source.name,
                            message: journalEntry.MESSAGE || '',
                            context: {
                                unit: journalEntry._SYSTEMD_UNIT,
                                pid: journalEntry._PID
                            }
                        } as LogEntry;
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean) as LogEntry[];
        } catch (error) {
            console.error(`Error collecting from journal for ${source.name}:`, error);
            return [];
        }
    }

    private parseLogLine(line: string, sourceName: string, fallbackTimestamp: number): LogEntry | null {
        // Try to parse as JSON first (structured logs)
        try {
            const parsed = JSON.parse(line);
            return {
                timestamp: parsed.timestamp || parsed.ts || fallbackTimestamp,
                level: parsed.level || parsed.severity || "info",
                source: sourceName,
                message: parsed.message || parsed.msg || line,
                context: parsed.context || {},
                sessionKey: parsed.sessionKey,
                agentId: parsed.agentId
            };
        } catch {
            // Fall back to parsing plain text logs
            return this.parseTextLogLine(line, sourceName, fallbackTimestamp);
        }
    }

    private parseTextLogLine(line: string, sourceName: string, fallbackTimestamp: number): LogEntry | null {
        // Common log patterns
        const patterns = [
            // ISO timestamp with level: 2024-04-23T14:30:15.123Z [INFO] message
            /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+\[(\w+)\]\s+(.+)$/,
            // Simple timestamp: 2024-04-23 14:30:15 INFO message
            /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(\w+)\s+(.+)$/,
            // Level first: INFO 2024-04-23T14:30:15 message
            /^(\w+)\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3}Z?)?)\s+(.+)$/
        ];

        for (const pattern of patterns) {
            const match = line.match(pattern);
            if (match) {
                const [, timestampStr, level, message] = match;
                const timestamp = new Date(timestampStr).getTime() || fallbackTimestamp;

                return {
                    timestamp,
                    level: level.toLowerCase() as LogEntry['level'],
                    source: sourceName,
                    message: message.trim(),
                    context: this.extractContextFromMessage(message)
                };
            }
        }

        // If no pattern matches, create a basic entry
        return {
            timestamp: fallbackTimestamp,
            level: "info",
            source: sourceName,
            message: line.trim()
        };
    }

    private extractContextFromMessage(message: string): Record<string, any> {
        const context: Record<string, any> = {};

        // Extract session keys
        const sessionMatch = message.match(/session[:\s]+([a-zA-Z0-9:_-]+)/i);
        if (sessionMatch) {
            context.sessionKey = sessionMatch[1];
        }

        // Extract agent IDs
        const agentMatch = message.match(/agent[:\s]+([a-zA-Z0-9_-]+)/i);
        if (agentMatch) {
            context.agentId = agentMatch[1];
        }

        // Extract error codes
        const errorMatch = message.match(/error[:\s]+(\w+)/i);
        if (errorMatch) {
            context.errorCode = errorMatch[1];
        }

        // Extract durations
        const durationMatch = message.match(/(\d+(?:\.\d+)?)(ms|s|m|h)/);
        if (durationMatch) {
            context.duration = durationMatch[0];
        }

        return context;
    }

    private mapJournalPriority(priority: string): LogEntry['level'] {
        const priorityMap: Record<string, LogEntry['level']> = {
            '0': 'error', // Emergency
            '1': 'error', // Alert
            '2': 'error', // Critical
            '3': 'error', // Error
            '4': 'warn',  // Warning
            '5': 'info',  // Notice
            '6': 'info',  // Info
            '7': 'debug'  // Debug
        };

        return priorityMap[priority] || 'info';
    }

    private async executeCommand(command: string): Promise<{
        success: boolean;
        stdout: string;
        stderr: string;
    }> {
        return new Promise((resolve) => {
            const [cmd, ...args] = command.split(' ');
            const child = spawn(cmd, args, { stdio: 'pipe' });
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

            // Timeout after 30 seconds
            setTimeout(() => {
                child.kill();
                resolve({
                    success: false,
                    stdout,
                    stderr: stderr + '\nCommand timed out',
                });
            }, 30000);
        });
    }

    private flushLogs(): void {
        if (this.logBuffer.length === 0) return;

        try {
            // Check if log rotation is needed
            this.rotateLogsIfNeeded();

            // Filter logs based on configuration
            const filteredLogs = this.logBuffer.filter(log => this.shouldIncludeLog(log));

            // Append to log file (JSONL format)
            const logLines = filteredLogs.map(log => JSON.stringify(log)).join('\n') + '\n';

            if (existsSync(this.config.outputPath)) {
                const existingContent = readFileSync(this.config.outputPath, 'utf8');
                writeFileSync(this.config.outputPath, existingContent + logLines);
            } else {
                writeFileSync(this.config.outputPath, logLines);
            }

            console.log(`📝 Flushed ${filteredLogs.length} log entries`);
            this.logBuffer = [];
        } catch (error) {
            console.error("Error flushing logs:", error);
        }
    }

    private shouldIncludeLog(log: LogEntry): boolean {
        // Check minimum level
        const levelPriority = { debug: 0, trace: 1, info: 2, warn: 3, error: 4 };
        const minPriority = levelPriority[this.config.filters.minLevel as keyof typeof levelPriority] || 2;
        const logPriority = levelPriority[log.level] || 2;

        if (logPriority < minPriority) {
            return false;
        }

        // Check exclude patterns
        for (const pattern of this.config.filters.excludePatterns) {
            if (log.message.includes(pattern)) {
                return false;
            }
        }

        // Check include patterns (if any specified, log must match at least one)
        if (this.config.filters.includePatterns.length > 0) {
            const matches = this.config.filters.includePatterns.some(pattern =>
                log.message.includes(pattern)
            );
            if (!matches) {
                return false;
            }
        }

        return true;
    }

    private rotateLogsIfNeeded(): void {
        if (!existsSync(this.config.outputPath)) {
            return;
        }

        const stats = statSync(this.config.outputPath);
        if (stats.size < this.config.maxLogSize) {
            return;
        }

        console.log("🔄 Rotating log files...");

        // Rotate existing files
        for (let i = this.config.maxLogFiles - 1; i >= 1; i--) {
            const oldFile = `${this.config.outputPath}.${i}`;
            const newFile = `${this.config.outputPath}.${i + 1}`;

            if (existsSync(oldFile)) {
                if (i === this.config.maxLogFiles - 1) {
                    // Delete the oldest file
                    try {
                        require('fs').unlinkSync(oldFile);
                    } catch (error) {
                        console.error(`Error deleting old log file ${oldFile}:`, error);
                    }
                } else {
                    // Rename to next number
                    try {
                        require('fs').renameSync(oldFile, newFile);
                    } catch (error) {
                        console.error(`Error rotating log file ${oldFile} to ${newFile}:`, error);
                    }
                }
            }
        }

        // Move current log to .1
        try {
            require('fs').renameSync(this.config.outputPath, `${this.config.outputPath}.1`);
        } catch (error) {
            console.error(`Error rotating current log file:`, error);
        }
    }

    // Public methods for querying logs
    getRecentLogs(minutes: number = 60, filters?: {
        level?: string;
        source?: string;
        sessionKey?: string;
    }): LogEntry[] {
        try {
            if (!existsSync(this.config.outputPath)) {
                return [];
            }

            const content = readFileSync(this.config.outputPath, 'utf8');
            const lines = content.split('\n').filter(Boolean);

            const cutoff = Date.now() - (minutes * 60 * 1000);
            const logs: LogEntry[] = lines
                .map(line => {
                    try {
                        return JSON.parse(line) as LogEntry;
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean) as LogEntry[];

            return logs
                .filter(log => log.timestamp > cutoff)
                .filter(log => {
                    if (filters?.level && log.level !== filters.level) return false;
                    if (filters?.source && log.source !== filters.source) return false;
                    if (filters?.sessionKey && log.sessionKey !== filters.sessionKey) return false;
                    return true;
                })
                .sort((a, b) => b.timestamp - a.timestamp);
        } catch (error) {
            console.error("Error reading logs:", error);
            return [];
        }
    }

    searchLogs(query: string, maxResults: number = 100): LogEntry[] {
        try {
            if (!existsSync(this.config.outputPath)) {
                return [];
            }

            const content = readFileSync(this.config.outputPath, 'utf8');
            const lines = content.split('\n').filter(Boolean);

            const logs: LogEntry[] = lines
                .map(line => {
                    try {
                        return JSON.parse(line) as LogEntry;
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean) as LogEntry[];

            const queryLower = query.toLowerCase();
            return logs
                .filter(log =>
                    log.message.toLowerCase().includes(queryLower) ||
                    log.source.toLowerCase().includes(queryLower) ||
                    (log.sessionKey && log.sessionKey.toLowerCase().includes(queryLower))
                )
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, maxResults);
        } catch (error) {
            console.error("Error searching logs:", error);
            return [];
        }
    }

    getLogStats(): {
        totalEntries: number;
        byLevel: Record<string, number>;
        bySource: Record<string, number>;
        timeRange: { start: number; end: number } | null;
    } {
        try {
            if (!existsSync(this.config.outputPath)) {
                return {
                    totalEntries: 0,
                    byLevel: {},
                    bySource: {},
                    timeRange: null
                };
            }

            const content = readFileSync(this.config.outputPath, 'utf8');
            const lines = content.split('\n').filter(Boolean);

            const logs: LogEntry[] = lines
                .map(line => {
                    try {
                        return JSON.parse(line) as LogEntry;
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean) as LogEntry[];

            const byLevel: Record<string, number> = {};
            const bySource: Record<string, number> = {};
            let minTime = Infinity;
            let maxTime = -Infinity;

            logs.forEach(log => {
                byLevel[log.level] = (byLevel[log.level] || 0) + 1;
                bySource[log.source] = (bySource[log.source] || 0) + 1;
                minTime = Math.min(minTime, log.timestamp);
                maxTime = Math.max(maxTime, log.timestamp);
            });

            return {
                totalEntries: logs.length,
                byLevel,
                bySource,
                timeRange: logs.length > 0 ? { start: minTime, end: maxTime } : null
            };
        } catch (error) {
            console.error("Error getting log stats:", error);
            return {
                totalEntries: 0,
                byLevel: {},
                bySource: {},
                timeRange: null
            };
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const collector = new OpenClawLogCollector();

    switch (command) {
        case 'start':
            collector.start().catch(console.error);

            // Handle graceful shutdown
            process.on('SIGINT', () => {
                console.log('\nReceived SIGINT, stopping collector...');
                collector.stop();
                process.exit(0);
            });

            process.on('SIGTERM', () => {
                console.log('\nReceived SIGTERM, stopping collector...');
                collector.stop();
                process.exit(0);
            });
            break;

        case 'recent':
            const minutes = parseInt(args[1]) || 60;
            const level = args[2];
            const logs = collector.getRecentLogs(minutes, level ? { level } : undefined);

            console.log(`📋 Recent logs (last ${minutes} minutes):`);
            logs.forEach(log => {
                const time = new Date(log.timestamp).toLocaleTimeString();
                const levelIcon = { error: '🔴', warn: '🟡', info: '🔵', debug: '⚪', trace: '⚫' }[log.level] || '⚪';
                console.log(`${time} ${levelIcon} [${log.source}] ${log.message}`);
            });
            break;

        case 'search':
            const query = args[1];
            if (!query) {
                console.log('Usage: node log-collector.ts search <query>');
                break;
            }

            const results = collector.searchLogs(query);
            console.log(`🔍 Search results for "${query}" (${results.length} matches):`);
            results.forEach(log => {
                const time = new Date(log.timestamp).toLocaleString();
                console.log(`${time} [${log.level}] [${log.source}] ${log.message}`);
            });
            break;

        case 'stats':
            const stats = collector.getLogStats();
            console.log('📊 Log Statistics:');
            console.log(`Total entries: ${stats.totalEntries}`);

            if (stats.timeRange) {
                const start = new Date(stats.timeRange.start).toLocaleString();
                const end = new Date(stats.timeRange.end).toLocaleString();
                console.log(`Time range: ${start} to ${end}`);
            }

            console.log('\nBy level:');
            Object.entries(stats.byLevel).forEach(([level, count]) => {
                console.log(`  ${level}: ${count}`);
            });

            console.log('\nBy source:');
            Object.entries(stats.bySource).forEach(([source, count]) => {
                console.log(`  ${source}: ${count}`);
            });
            break;

        default:
            console.log('OpenClaw Log Collector');
            console.log('Usage:');
            console.log('  node log-collector.ts start              - Start collecting logs');
            console.log('  node log-collector.ts recent [minutes]   - Show recent logs');
            console.log('  node log-collector.ts search <query>     - Search logs');
            console.log('  node log-collector.ts stats              - Show log statistics');
            break;
    }
}

export { OpenClawLogCollector, LogEntry, LogSource };

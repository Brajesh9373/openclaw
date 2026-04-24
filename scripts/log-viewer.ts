#!/usr/bin/env node
/**
 * OpenClaw Log Viewer
 * 
 * Advanced log viewing, filtering, and analysis tool
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
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

interface LogFilter {
    level?: string[];
    source?: string[];
    sessionKey?: string;
    agentId?: string;
    timeRange?: { start: number; end: number };
    messagePattern?: RegExp;
    excludePatterns?: RegExp[];
}

class OpenClawLogViewer {
    private logPath: string;

    constructor(logPath?: string) {
        this.logPath = logPath || join(homedir(), ".openclaw", "collected-logs.jsonl");
    }

    private loadLogs(): LogEntry[] {
        try {
            if (!existsSync(this.logPath)) {
                console.log(`❌ Log file not found: ${this.logPath}`);
                console.log("Make sure the log collector is running: node scripts/log-collector.ts start");
                return [];
            }

            const content = readFileSync(this.logPath, 'utf8');
            const lines = content.split('\n').filter(Boolean);

            return lines
                .map(line => {
                    try {
                        return JSON.parse(line) as LogEntry;
                    } catch (error) {
                        console.warn(`Failed to parse log line: ${line.substring(0, 100)}...`);
                        return null;
                    }
                })
                .filter(Boolean) as LogEntry[];
        } catch (error) {
            console.error("Error loading logs:", error);
            return [];
        }
    }

    private filterLogs(logs: LogEntry[], filter: LogFilter): LogEntry[] {
        return logs.filter(log => {
            // Level filter
            if (filter.level && filter.level.length > 0) {
                if (!filter.level.includes(log.level)) {
                    return false;
                }
            }

            // Source filter
            if (filter.source && filter.source.length > 0) {
                if (!filter.source.includes(log.source)) {
                    return false;
                }
            }

            // Session key filter
            if (filter.sessionKey && log.sessionKey !== filter.sessionKey) {
                return false;
            }

            // Agent ID filter
            if (filter.agentId && log.agentId !== filter.agentId) {
                return false;
            }

            // Time range filter
            if (filter.timeRange) {
                if (log.timestamp < filter.timeRange.start || log.timestamp > filter.timeRange.end) {
                    return false;
                }
            }

            // Message pattern filter
            if (filter.messagePattern && !filter.messagePattern.test(log.message)) {
                return false;
            }

            // Exclude patterns
            if (filter.excludePatterns) {
                for (const pattern of filter.excludePatterns) {
                    if (pattern.test(log.message)) {
                        return false;
                    }
                }
            }

            return true;
        });
    }

    private formatLogEntry(log: LogEntry, options: {
        showTimestamp?: boolean;
        showLevel?: boolean;
        showSource?: boolean;
        showContext?: boolean;
        colorize?: boolean;
    } = {}): string {
        const {
            showTimestamp = true,
            showLevel = true,
            showSource = true,
            showContext = false,
            colorize = true
        } = options;

        let parts: string[] = [];

        // Timestamp
        if (showTimestamp) {
            const time = new Date(log.timestamp).toLocaleString();
            parts.push(colorize ? `\x1b[90m${time}\x1b[0m` : time);
        }

        // Level with color
        if (showLevel) {
            const levelColors = {
                error: '\x1b[31m', // Red
                warn: '\x1b[33m',  // Yellow
                info: '\x1b[36m',  // Cyan
                debug: '\x1b[90m', // Gray
                trace: '\x1b[35m'  // Magenta
            };

            const color = colorize ? levelColors[log.level] || '' : '';
            const reset = colorize ? '\x1b[0m' : '';
            const levelStr = `[${log.level.toUpperCase()}]`;
            parts.push(`${color}${levelStr}${reset}`);
        }

        // Source
        if (showSource) {
            const sourceStr = `[${log.source}]`;
            parts.push(colorize ? `\x1b[94m${sourceStr}\x1b[0m` : sourceStr);
        }

        // Session key
        if (log.sessionKey) {
            const sessionStr = `{${log.sessionKey}}`;
            parts.push(colorize ? `\x1b[95m${sessionStr}\x1b[0m` : sessionStr);
        }

        // Message
        parts.push(log.message);

        // Context
        if (showContext && log.context && Object.keys(log.context).length > 0) {
            const contextStr = JSON.stringify(log.context);
            parts.push(colorize ? `\x1b[90m${contextStr}\x1b[0m` : contextStr);
        }

        return parts.join(' ');
    }

    showLogs(filter: LogFilter = {}, options: {
        limit?: number;
        tail?: boolean;
        follow?: boolean;
        format?: 'default' | 'compact' | 'json' | 'csv';
    } = {}): void {
        const logs = this.loadLogs();
        const filtered = this.filterLogs(logs, filter);

        // Sort by timestamp
        const sorted = filtered.sort((a, b) =>
            options.tail ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
        );

        // Apply limit
        const limited = options.limit ? sorted.slice(0, options.limit) : sorted;

        if (limited.length === 0) {
            console.log("No logs match the specified criteria");
            return;
        }

        console.log(`📋 Showing ${limited.length} log entries (${filtered.length} total matches)`);
        console.log("─".repeat(80));

        switch (options.format) {
            case 'json':
                limited.forEach(log => console.log(JSON.stringify(log, null, 2)));
                break;

            case 'csv':
                console.log("timestamp,level,source,sessionKey,agentId,message");
                limited.forEach(log => {
                    const csv = [
                        log.timestamp,
                        log.level,
                        log.source,
                        log.sessionKey || '',
                        log.agentId || '',
                        `"${log.message.replace(/"/g, '""')}"`
                    ].join(',');
                    console.log(csv);
                });
                break;

            case 'compact':
                limited.forEach(log => {
                    const time = new Date(log.timestamp).toLocaleTimeString();
                    const level = log.level[0].toUpperCase();
                    console.log(`${time} ${level} ${log.message}`);
                });
                break;

            default:
                limited.forEach(log => {
                    console.log(this.formatLogEntry(log, {
                        showTimestamp: true,
                        showLevel: true,
                        showSource: true,
                        showContext: false,
                        colorize: process.stdout.isTTY
                    }));
                });
                break;
        }
    }

    analyzeLogs(filter: LogFilter = {}): void {
        const logs = this.loadLogs();
        const filtered = this.filterLogs(logs, filter);

        if (filtered.length === 0) {
            console.log("No logs to analyze");
            return;
        }

        console.log("📊 Log Analysis");
        console.log("─".repeat(50));

        // Time range
        const timestamps = filtered.map(log => log.timestamp).sort((a, b) => a - b);
        const startTime = new Date(timestamps[0]).toLocaleString();
        const endTime = new Date(timestamps[timestamps.length - 1]).toLocaleString();
        const duration = timestamps[timestamps.length - 1] - timestamps[0];

        console.log(`Time Range: ${startTime} to ${endTime}`);
        console.log(`Duration: ${this.formatDuration(duration)}`);
        console.log(`Total Entries: ${filtered.length}`);

        // Level distribution
        const levelCounts: Record<string, number> = {};
        filtered.forEach(log => {
            levelCounts[log.level] = (levelCounts[log.level] || 0) + 1;
        });

        console.log("\n📈 Level Distribution:");
        Object.entries(levelCounts)
            .sort(([, a], [, b]) => b - a)
            .forEach(([level, count]) => {
                const percentage = ((count / filtered.length) * 100).toFixed(1);
                const bar = "█".repeat(Math.floor(count / filtered.length * 20));
                console.log(`  ${level.padEnd(5)}: ${count.toString().padStart(4)} (${percentage}%) ${bar}`);
            });

        // Source distribution
        const sourceCounts: Record<string, number> = {};
        filtered.forEach(log => {
            sourceCounts[log.source] = (sourceCounts[log.source] || 0) + 1;
        });

        console.log("\n📡 Source Distribution:");
        Object.entries(sourceCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10) // Top 10 sources
            .forEach(([source, count]) => {
                const percentage = ((count / filtered.length) * 100).toFixed(1);
                console.log(`  ${source.padEnd(20)}: ${count.toString().padStart(4)} (${percentage}%)`);
            });

        // Session activity
        const sessionCounts: Record<string, number> = {};
        filtered.forEach(log => {
            if (log.sessionKey) {
                sessionCounts[log.sessionKey] = (sessionCounts[log.sessionKey] || 0) + 1;
            }
        });

        if (Object.keys(sessionCounts).length > 0) {
            console.log("\n🔑 Session Activity:");
            Object.entries(sessionCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10) // Top 10 sessions
                .forEach(([session, count]) => {
                    console.log(`  ${session.padEnd(30)}: ${count} entries`);
                });
        }

        // Error analysis
        const errors = filtered.filter(log => log.level === 'error');
        if (errors.length > 0) {
            console.log(`\n🔴 Error Analysis (${errors.length} errors):`);

            // Group similar errors
            const errorGroups: Record<string, LogEntry[]> = {};
            errors.forEach(error => {
                // Simple grouping by first 50 characters of message
                const key = error.message.substring(0, 50);
                if (!errorGroups[key]) {
                    errorGroups[key] = [];
                }
                errorGroups[key].push(error);
            });

            Object.entries(errorGroups)
                .sort(([, a], [, b]) => b.length - a.length)
                .slice(0, 5) // Top 5 error types
                .forEach(([errorType, errorLogs]) => {
                    console.log(`  ${errorType}... (${errorLogs.length} occurrences)`);
                    if (errorLogs.length > 1) {
                        const first = new Date(errorLogs[0].timestamp).toLocaleTimeString();
                        const last = new Date(errorLogs[errorLogs.length - 1].timestamp).toLocaleTimeString();
                        console.log(`    First: ${first}, Last: ${last}`);
                    }
                });
        }

        // Activity timeline (hourly buckets)
        console.log("\n⏰ Activity Timeline (entries per hour):");
        const hourlyActivity: Record<string, number> = {};
        filtered.forEach(log => {
            const hour = new Date(log.timestamp).toISOString().slice(0, 13);
            hourlyActivity[hour] = (hourlyActivity[hour] || 0) + 1;
        });

        Object.entries(hourlyActivity)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-24) // Last 24 hours
            .forEach(([hour, count]) => {
                const time = new Date(hour + ':00:00Z').toLocaleString();
                const bar = "▓".repeat(Math.floor(count / Math.max(...Object.values(hourlyActivity)) * 30));
                console.log(`  ${time}: ${count.toString().padStart(3)} ${bar}`);
            });
    }

    watchLogs(filter: LogFilter = {}): void {
        console.log("👀 Watching logs (Press Ctrl+C to exit)");
        console.log("─".repeat(60));

        let lastTimestamp = Date.now();

        const checkForNewLogs = () => {
            const logs = this.loadLogs();
            const newLogs = logs.filter(log => log.timestamp > lastTimestamp);
            const filtered = this.filterLogs(newLogs, filter);

            filtered.forEach(log => {
                console.log(this.formatLogEntry(log, {
                    showTimestamp: true,
                    showLevel: true,
                    showSource: true,
                    colorize: process.stdout.isTTY
                }));
            });

            if (filtered.length > 0) {
                lastTimestamp = Math.max(...filtered.map(log => log.timestamp));
            }
        };

        // Check every 2 seconds
        const interval = setInterval(checkForNewLogs, 2000);

        // Handle Ctrl+C
        process.on('SIGINT', () => {
            clearInterval(interval);
            console.log('\n\n👋 Log watching stopped');
            process.exit(0);
        });
    }

    private formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    exportLogs(filter: LogFilter = {}, outputPath: string, format: 'json' | 'csv' | 'txt' = 'json'): void {
        const logs = this.loadLogs();
        const filtered = this.filterLogs(logs, filter);

        if (filtered.length === 0) {
            console.log("No logs to export");
            return;
        }

        try {
            let content: string;

            switch (format) {
                case 'csv':
                    const csvHeader = "timestamp,level,source,sessionKey,agentId,message\n";
                    const csvRows = filtered.map(log => {
                        return [
                            log.timestamp,
                            log.level,
                            log.source,
                            log.sessionKey || '',
                            log.agentId || '',
                            `"${log.message.replace(/"/g, '""')}"`
                        ].join(',');
                    }).join('\n');
                    content = csvHeader + csvRows;
                    break;

                case 'txt':
                    content = filtered.map(log =>
                        this.formatLogEntry(log, { colorize: false })
                    ).join('\n');
                    break;

                case 'json':
                default:
                    content = JSON.stringify(filtered, null, 2);
                    break;
            }

            require('fs').writeFileSync(outputPath, content);
            console.log(`✅ Exported ${filtered.length} log entries to ${outputPath}`);
        } catch (error) {
            console.error(`❌ Error exporting logs: ${error}`);
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const viewer = new OpenClawLogViewer();

    // Parse common filter options
    const parseFilter = (args: string[]): LogFilter => {
        const filter: LogFilter = {};

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            const nextArg = args[i + 1];

            switch (arg) {
                case '--level':
                    if (nextArg) {
                        filter.level = nextArg.split(',');
                        i++;
                    }
                    break;
                case '--source':
                    if (nextArg) {
                        filter.source = nextArg.split(',');
                        i++;
                    }
                    break;
                case '--session':
                    if (nextArg) {
                        filter.sessionKey = nextArg;
                        i++;
                    }
                    break;
                case '--agent':
                    if (nextArg) {
                        filter.agentId = nextArg;
                        i++;
                    }
                    break;
                case '--since':
                    if (nextArg) {
                        const minutes = parseInt(nextArg);
                        if (!isNaN(minutes)) {
                            filter.timeRange = {
                                start: Date.now() - (minutes * 60 * 1000),
                                end: Date.now()
                            };
                        }
                        i++;
                    }
                    break;
                case '--grep':
                    if (nextArg) {
                        filter.messagePattern = new RegExp(nextArg, 'i');
                        i++;
                    }
                    break;
            }
        }

        return filter;
    };

    switch (command) {
        case 'show':
        case 'list':
            const showFilter = parseFilter(args.slice(1));
            const limit = args.includes('--limit') ?
                parseInt(args[args.indexOf('--limit') + 1]) : undefined;
            const tail = args.includes('--tail');
            const format = args.includes('--json') ? 'json' :
                args.includes('--csv') ? 'csv' :
                    args.includes('--compact') ? 'compact' : 'default';

            viewer.showLogs(showFilter, { limit, tail, format: format as any });
            break;

        case 'analyze':
        case 'stats':
            const analyzeFilter = parseFilter(args.slice(1));
            viewer.analyzeLogs(analyzeFilter);
            break;

        case 'watch':
        case 'tail':
            const watchFilter = parseFilter(args.slice(1));
            viewer.watchLogs(watchFilter);
            break;

        case 'export':
            const exportPath = args[1];
            if (!exportPath) {
                console.log('Usage: node log-viewer.ts export <output-path> [options]');
                break;
            }

            const exportFilter = parseFilter(args.slice(2));
            const exportFormat = args.includes('--csv') ? 'csv' :
                args.includes('--txt') ? 'txt' : 'json';

            viewer.exportLogs(exportFilter, exportPath, exportFormat as any);
            break;

        default:
            console.log('OpenClaw Log Viewer');
            console.log('Usage:');
            console.log('  node log-viewer.ts show [options]     - Show logs');
            console.log('  node log-viewer.ts analyze [options]  - Analyze logs');
            console.log('  node log-viewer.ts watch [options]    - Watch logs in real-time');
            console.log('  node log-viewer.ts export <path> [options] - Export logs');
            console.log('');
            console.log('Filter Options:');
            console.log('  --level <levels>     Filter by log level (error,warn,info,debug)');
            console.log('  --source <sources>   Filter by log source');
            console.log('  --session <key>      Filter by session key');
            console.log('  --agent <id>         Filter by agent ID');
            console.log('  --since <minutes>    Show logs from last N minutes');
            console.log('  --grep <pattern>     Filter by message pattern');
            console.log('');
            console.log('Display Options:');
            console.log('  --limit <n>          Limit number of entries');
            console.log('  --tail               Show newest entries first');
            console.log('  --json               Output as JSON');
            console.log('  --csv                Output as CSV');
            console.log('  --compact            Compact output format');
            console.log('');
            console.log('Examples:');
            console.log('  node log-viewer.ts show --level error --since 60');
            console.log('  node log-viewer.ts analyze --source openclaw-gateway');
            console.log('  node log-viewer.ts watch --grep "session started"');
            console.log('  node log-viewer.ts export logs.json --level error,warn');
            break;
    }
}

export { OpenClawLogViewer, LogFilter };

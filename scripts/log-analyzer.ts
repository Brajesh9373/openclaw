#!/usr/bin/env node
/**
 * OpenClaw Log Analyzer
 * 
 * Advanced log analysis with pattern detection, anomaly detection, and insights
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
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

interface LogPattern {
    pattern: RegExp;
    name: string;
    category: "error" | "performance" | "security" | "activity" | "system";
    severity: "low" | "medium" | "high" | "critical";
    description: string;
}

interface AnalysisResult {
    summary: {
        totalLogs: number;
        timeRange: { start: number; end: number };
        logRate: number; // logs per minute
        errorRate: number; // errors per minute
    };
    patterns: {
        pattern: LogPattern;
        matches: LogEntry[];
        frequency: number;
        trend: "increasing" | "decreasing" | "stable";
    }[];
    anomalies: {
        type: "spike" | "gap" | "unusual_pattern";
        description: string;
        timestamp: number;
        severity: "low" | "medium" | "high";
        evidence: LogEntry[];
    }[];
    insights: string[];
    recommendations: string[];
}

class OpenClawLogAnalyzer {
    private logPath: string;
    private patterns: LogPattern[];

    constructor(logPath?: string) {
        this.logPath = logPath || join(homedir(), ".openclaw", "collected-logs.jsonl");
        this.patterns = this.getDefaultPatterns();
    }

    private getDefaultPatterns(): LogPattern[] {
        return [
            // Error patterns
            {
                pattern: /failed to connect|connection refused|timeout/i,
                name: "Connection Issues",
                category: "error",
                severity: "high",
                description: "Network connectivity problems"
            },
            {
                pattern: /out of memory|memory allocation failed|heap.*exceeded/i,
                name: "Memory Issues",
                category: "error",
                severity: "critical",
                description: "Memory-related errors that could cause system instability"
            },
            {
                pattern: /authentication failed|unauthorized|access denied/i,
                name: "Authentication Failures",
                category: "security",
                severity: "high",
                description: "Authentication or authorization failures"
            },
            {
                pattern: /rate limit|too many requests|throttled/i,
                name: "Rate Limiting",
                category: "performance",
                severity: "medium",
                description: "API rate limiting or throttling detected"
            },

            // Performance patterns
            {
                pattern: /slow query|query took.*ms|execution time.*exceeded/i,
                name: "Slow Operations",
                category: "performance",
                severity: "medium",
                description: "Operations taking longer than expected"
            },
            {
                pattern: /high cpu|cpu usage.*%|load average/i,
                name: "High CPU Usage",
                category: "performance",
                severity: "medium",
                description: "High CPU utilization detected"
            },

            // Activity patterns
            {
                pattern: /session started|new session|session created/i,
                name: "Session Creation",
                category: "activity",
                severity: "low",
                description: "New user sessions being created"
            },
            {
                pattern: /agent.*started|agent.*initialized|agent.*spawned/i,
                name: "Agent Activity",
                category: "activity",
                severity: "low",
                description: "Agent lifecycle events"
            },
            {
                pattern: /heartbeat.*failed|heartbeat.*timeout|heartbeat.*missed/i,
                name: "Heartbeat Issues",
                category: "system",
                severity: "medium",
                description: "System heartbeat problems"
            },

            // Security patterns
            {
                pattern: /suspicious.*activity|potential.*attack|security.*violation/i,
                name: "Security Alerts",
                category: "security",
                severity: "critical",
                description: "Potential security threats or violations"
            },
            {
                pattern: /invalid.*token|token.*expired|malformed.*request/i,
                name: "Token Issues",
                category: "security",
                severity: "medium",
                description: "Authentication token problems"
            },

            // System patterns
            {
                pattern: /disk.*full|no space left|storage.*exceeded/i,
                name: "Storage Issues",
                category: "system",
                severity: "high",
                description: "Storage capacity problems"
            },
            {
                pattern: /service.*unavailable|service.*down|health.*check.*failed/i,
                name: "Service Availability",
                category: "system",
                severity: "high",
                description: "Service availability issues"
            }
        ];
    }

    private loadLogs(): LogEntry[] {
        try {
            if (!existsSync(this.logPath)) {
                throw new Error(`Log file not found: ${this.logPath}`);
            }

            const content = readFileSync(this.logPath, 'utf8');
            const lines = content.split('\n').filter(Boolean);

            return lines
                .map(line => {
                    try {
                        return JSON.parse(line) as LogEntry;
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean) as LogEntry[];
        } catch (error) {
            throw new Error(`Error loading logs: ${error}`);
        }
    }

    analyze(timeRangeHours?: number): AnalysisResult {
        const logs = this.loadLogs();

        if (logs.length === 0) {
            throw new Error("No logs available for analysis");
        }

        // Filter by time range if specified
        const filteredLogs = timeRangeHours ?
            logs.filter(log => log.timestamp > Date.now() - (timeRangeHours * 60 * 60 * 1000)) :
            logs;

        const sortedLogs = filteredLogs.sort((a, b) => a.timestamp - b.timestamp);

        // Basic summary
        const timeRange = {
            start: sortedLogs[0].timestamp,
            end: sortedLogs[sortedLogs.length - 1].timestamp
        };

        const durationMinutes = (timeRange.end - timeRange.start) / (1000 * 60);
        const logRate = sortedLogs.length / Math.max(durationMinutes, 1);

        const errors = sortedLogs.filter(log => log.level === 'error');
        const errorRate = errors.length / Math.max(durationMinutes, 1);

        // Pattern analysis
        const patternResults = this.analyzePatterns(sortedLogs);

        // Anomaly detection
        const anomalies = this.detectAnomalies(sortedLogs);

        // Generate insights and recommendations
        const insights = this.generateInsights(sortedLogs, patternResults, anomalies);
        const recommendations = this.generateRecommendations(patternResults, anomalies);

        return {
            summary: {
                totalLogs: sortedLogs.length,
                timeRange,
                logRate,
                errorRate
            },
            patterns: patternResults,
            anomalies,
            insights,
            recommendations
        };
    }

    private analyzePatterns(logs: LogEntry[]): AnalysisResult['patterns'] {
        return this.patterns.map(pattern => {
            const matches = logs.filter(log => pattern.pattern.test(log.message));
            const frequency = matches.length;

            // Calculate trend (compare first half vs second half)
            const midpoint = Math.floor(logs.length / 2);
            const firstHalf = logs.slice(0, midpoint);
            const secondHalf = logs.slice(midpoint);

            const firstHalfMatches = firstHalf.filter(log => pattern.pattern.test(log.message)).length;
            const secondHalfMatches = secondHalf.filter(log => pattern.pattern.test(log.message)).length;

            let trend: "increasing" | "decreasing" | "stable" = "stable";
            if (secondHalfMatches > firstHalfMatches * 1.2) {
                trend = "increasing";
            } else if (secondHalfMatches < firstHalfMatches * 0.8) {
                trend = "decreasing";
            }

            return {
                pattern,
                matches,
                frequency,
                trend
            };
        }).filter(result => result.frequency > 0)
            .sort((a, b) => b.frequency - a.frequency);
    }

    private detectAnomalies(logs: LogEntry[]): AnalysisResult['anomalies'] {
        const anomalies: AnalysisResult['anomalies'] = [];

        // Detect activity spikes
        const hourlyBuckets = this.groupLogsByHour(logs);
        const avgLogsPerHour = Object.values(hourlyBuckets).reduce((sum, count) => sum + count, 0) / Object.keys(hourlyBuckets).length;

        Object.entries(hourlyBuckets).forEach(([hour, count]) => {
            if (count > avgLogsPerHour * 3) { // 3x average is considered a spike
                const timestamp = new Date(hour + ':00:00Z').getTime();
                const evidence = logs.filter(log => {
                    const logHour = new Date(log.timestamp).toISOString().slice(0, 13);
                    return logHour === hour;
                }).slice(0, 10); // First 10 logs as evidence

                anomalies.push({
                    type: "spike",
                    description: `Activity spike detected: ${count} logs (${(count / avgLogsPerHour).toFixed(1)}x average)`,
                    timestamp,
                    severity: count > avgLogsPerHour * 5 ? "high" : "medium",
                    evidence
                });
            }
        });

        // Detect gaps in logging
        const sortedLogs = logs.sort((a, b) => a.timestamp - b.timestamp);
        for (let i = 1; i < sortedLogs.length; i++) {
            const gap = sortedLogs[i].timestamp - sortedLogs[i - 1].timestamp;
            const fiveMinutes = 5 * 60 * 1000;

            if (gap > fiveMinutes) {
                anomalies.push({
                    type: "gap",
                    description: `Logging gap detected: ${Math.round(gap / 1000 / 60)} minutes`,
                    timestamp: sortedLogs[i - 1].timestamp,
                    severity: gap > 30 * 60 * 1000 ? "high" : "medium", // 30 minutes
                    evidence: [sortedLogs[i - 1], sortedLogs[i]]
                });
            }
        }

        // Detect unusual error patterns
        const errorLogs = logs.filter(log => log.level === 'error');
        const errorsByMessage = new Map<string, LogEntry[]>();

        errorLogs.forEach(log => {
            const key = log.message.substring(0, 50); // Group by first 50 chars
            if (!errorsByMessage.has(key)) {
                errorsByMessage.set(key, []);
            }
            errorsByMessage.get(key)!.push(log);
        });

        errorsByMessage.forEach((errors, messagePrefix) => {
            if (errors.length >= 5) { // 5 or more similar errors
                const timeSpan = errors[errors.length - 1].timestamp - errors[0].timestamp;
                if (timeSpan < 60 * 60 * 1000) { // Within 1 hour
                    anomalies.push({
                        type: "unusual_pattern",
                        description: `Repeated error pattern: "${messagePrefix}..." (${errors.length} occurrences in ${Math.round(timeSpan / 1000 / 60)} minutes)`,
                        timestamp: errors[0].timestamp,
                        severity: errors.length >= 10 ? "high" : "medium",
                        evidence: errors.slice(0, 5)
                    });
                }
            }
        });

        return anomalies.sort((a, b) => b.timestamp - a.timestamp);
    }

    private groupLogsByHour(logs: LogEntry[]): Record<string, number> {
        const buckets: Record<string, number> = {};

        logs.forEach(log => {
            const hour = new Date(log.timestamp).toISOString().slice(0, 13);
            buckets[hour] = (buckets[hour] || 0) + 1;
        });

        return buckets;
    }

    private generateInsights(
        logs: LogEntry[],
        patterns: AnalysisResult['patterns'],
        anomalies: AnalysisResult['anomalies']
    ): string[] {
        const insights: string[] = [];

        // Activity insights
        const sessionLogs = logs.filter(log => log.sessionKey);
        const uniqueSessions = new Set(sessionLogs.map(log => log.sessionKey)).size;
        if (uniqueSessions > 0) {
            insights.push(`System handled ${uniqueSessions} unique sessions with ${sessionLogs.length} session-related events`);
        }

        // Error insights
        const errorLogs = logs.filter(log => log.level === 'error');
        if (errorLogs.length > 0) {
            const errorRate = (errorLogs.length / logs.length * 100).toFixed(1);
            insights.push(`Error rate: ${errorRate}% (${errorLogs.length} errors out of ${logs.length} total logs)`);
        }

        // Pattern insights
        const criticalPatterns = patterns.filter(p => p.pattern.severity === 'critical');
        if (criticalPatterns.length > 0) {
            insights.push(`Found ${criticalPatterns.length} critical issue patterns requiring immediate attention`);
        }

        const increasingPatterns = patterns.filter(p => p.trend === 'increasing');
        if (increasingPatterns.length > 0) {
            insights.push(`${increasingPatterns.length} issue patterns are increasing in frequency`);
        }

        // Performance insights
        const performancePatterns = patterns.filter(p => p.pattern.category === 'performance');
        if (performancePatterns.length > 0) {
            const totalPerformanceIssues = performancePatterns.reduce((sum, p) => sum + p.frequency, 0);
            insights.push(`Detected ${totalPerformanceIssues} performance-related events across ${performancePatterns.length} different patterns`);
        }

        // Anomaly insights
        const highSeverityAnomalies = anomalies.filter(a => a.severity === 'high');
        if (highSeverityAnomalies.length > 0) {
            insights.push(`Found ${highSeverityAnomalies.length} high-severity anomalies that may indicate system issues`);
        }

        return insights;
    }

    private generateRecommendations(
        patterns: AnalysisResult['patterns'],
        anomalies: AnalysisResult['anomalies']
    ): string[] {
        const recommendations: string[] = [];

        // Critical pattern recommendations
        const criticalPatterns = patterns.filter(p => p.pattern.severity === 'critical');
        criticalPatterns.forEach(pattern => {
            switch (pattern.pattern.category) {
                case 'error':
                    recommendations.push(`🔴 CRITICAL: Address ${pattern.pattern.name} immediately (${pattern.frequency} occurrences)`);
                    break;
                case 'security':
                    recommendations.push(`🛡️ SECURITY: Investigate ${pattern.pattern.name} for potential security threats (${pattern.frequency} occurrences)`);
                    break;
                case 'system':
                    recommendations.push(`⚠️ SYSTEM: Fix ${pattern.pattern.name} to prevent system instability (${pattern.frequency} occurrences)`);
                    break;
            }
        });

        // Increasing trend recommendations
        const increasingPatterns = patterns.filter(p => p.trend === 'increasing' && p.pattern.severity !== 'low');
        if (increasingPatterns.length > 0) {
            recommendations.push(`📈 Monitor increasing patterns: ${increasingPatterns.map(p => p.pattern.name).join(', ')}`);
        }

        // Memory issue recommendations
        const memoryPatterns = patterns.filter(p => p.pattern.name.includes('Memory'));
        if (memoryPatterns.length > 0) {
            recommendations.push(`💾 Consider increasing memory allocation or investigating memory leaks`);
        }

        // Connection issue recommendations
        const connectionPatterns = patterns.filter(p => p.pattern.name.includes('Connection'));
        if (connectionPatterns.length > 0) {
            recommendations.push(`🔌 Review network configuration and connection pooling settings`);
        }

        // Rate limiting recommendations
        const rateLimitPatterns = patterns.filter(p => p.pattern.name.includes('Rate Limit'));
        if (rateLimitPatterns.length > 0) {
            recommendations.push(`⏱️ Implement exponential backoff or increase rate limits`);
        }

        // Anomaly-based recommendations
        const spikes = anomalies.filter(a => a.type === 'spike');
        if (spikes.length > 0) {
            recommendations.push(`📊 Investigate activity spikes to understand load patterns and capacity needs`);
        }

        const gaps = anomalies.filter(a => a.type === 'gap');
        if (gaps.length > 0) {
            recommendations.push(`🕳️ Review logging gaps - may indicate service interruptions or logging issues`);
        }

        // General recommendations
        if (patterns.length === 0) {
            recommendations.push(`✅ No significant issues detected in the analyzed logs`);
        }

        return recommendations;
    }

    generateReport(analysis: AnalysisResult, outputPath?: string): string {
        const report = this.formatAnalysisReport(analysis);

        if (outputPath) {
            writeFileSync(outputPath, report);
            console.log(`📄 Analysis report saved to: ${outputPath}`);
        }

        return report;
    }

    private formatAnalysisReport(analysis: AnalysisResult): string {
        const lines: string[] = [];

        lines.push("# OpenClaw Log Analysis Report");
        lines.push(`Generated: ${new Date().toLocaleString()}`);
        lines.push("");

        // Summary
        lines.push("## Summary");
        lines.push(`- **Total Logs**: ${analysis.summary.totalLogs.toLocaleString()}`);
        lines.push(`- **Time Range**: ${new Date(analysis.summary.timeRange.start).toLocaleString()} to ${new Date(analysis.summary.timeRange.end).toLocaleString()}`);
        lines.push(`- **Log Rate**: ${analysis.summary.logRate.toFixed(2)} logs/minute`);
        lines.push(`- **Error Rate**: ${analysis.summary.errorRate.toFixed(2)} errors/minute`);
        lines.push("");

        // Insights
        if (analysis.insights.length > 0) {
            lines.push("## Key Insights");
            analysis.insights.forEach(insight => {
                lines.push(`- ${insight}`);
            });
            lines.push("");
        }

        // Recommendations
        if (analysis.recommendations.length > 0) {
            lines.push("## Recommendations");
            analysis.recommendations.forEach(rec => {
                lines.push(`- ${rec}`);
            });
            lines.push("");
        }

        // Patterns
        if (analysis.patterns.length > 0) {
            lines.push("## Detected Patterns");
            analysis.patterns.forEach(pattern => {
                const trendIcon = pattern.trend === 'increasing' ? '📈' :
                    pattern.trend === 'decreasing' ? '📉' : '➡️';
                const severityIcon = pattern.pattern.severity === 'critical' ? '🔴' :
                    pattern.pattern.severity === 'high' ? '🟠' :
                        pattern.pattern.severity === 'medium' ? '🟡' : '🟢';

                lines.push(`### ${severityIcon} ${pattern.pattern.name} ${trendIcon}`);
                lines.push(`- **Category**: ${pattern.pattern.category}`);
                lines.push(`- **Severity**: ${pattern.pattern.severity}`);
                lines.push(`- **Frequency**: ${pattern.frequency} occurrences`);
                lines.push(`- **Trend**: ${pattern.trend}`);
                lines.push(`- **Description**: ${pattern.pattern.description}`);

                if (pattern.matches.length > 0) {
                    lines.push("- **Recent Examples**:");
                    pattern.matches.slice(-3).forEach(match => {
                        const time = new Date(match.timestamp).toLocaleTimeString();
                        lines.push(`  - ${time}: ${match.message.substring(0, 100)}...`);
                    });
                }
                lines.push("");
            });
        }

        // Anomalies
        if (analysis.anomalies.length > 0) {
            lines.push("## Detected Anomalies");
            analysis.anomalies.forEach(anomaly => {
                const severityIcon = anomaly.severity === 'high' ? '🔴' :
                    anomaly.severity === 'medium' ? '🟡' : '🟢';
                const typeIcon = anomaly.type === 'spike' ? '📈' :
                    anomaly.type === 'gap' ? '🕳️' : '🔍';

                lines.push(`### ${severityIcon} ${typeIcon} ${anomaly.type.toUpperCase()}`);
                lines.push(`- **Time**: ${new Date(anomaly.timestamp).toLocaleString()}`);
                lines.push(`- **Severity**: ${anomaly.severity}`);
                lines.push(`- **Description**: ${anomaly.description}`);
                lines.push("");
            });
        }

        return lines.join('\n');
    }

    printAnalysis(analysis: AnalysisResult): void {
        console.log("🔍 OpenClaw Log Analysis Results");
        console.log("═".repeat(60));

        // Summary
        console.log("\n📊 Summary:");
        console.log(`   Total Logs: ${analysis.summary.totalLogs.toLocaleString()}`);
        console.log(`   Time Range: ${new Date(analysis.summary.timeRange.start).toLocaleString()}`);
        console.log(`              to ${new Date(analysis.summary.timeRange.end).toLocaleString()}`);
        console.log(`   Log Rate: ${analysis.summary.logRate.toFixed(2)} logs/minute`);
        console.log(`   Error Rate: ${analysis.summary.errorRate.toFixed(2)} errors/minute`);

        // Key insights
        if (analysis.insights.length > 0) {
            console.log("\n💡 Key Insights:");
            analysis.insights.forEach(insight => {
                console.log(`   • ${insight}`);
            });
        }

        // Recommendations
        if (analysis.recommendations.length > 0) {
            console.log("\n🎯 Recommendations:");
            analysis.recommendations.forEach(rec => {
                console.log(`   • ${rec}`);
            });
        }

        // Top patterns
        if (analysis.patterns.length > 0) {
            console.log("\n🔍 Top Issue Patterns:");
            analysis.patterns.slice(0, 5).forEach((pattern, index) => {
                const trendIcon = pattern.trend === 'increasing' ? '📈' :
                    pattern.trend === 'decreasing' ? '📉' : '➡️';
                const severityIcon = pattern.pattern.severity === 'critical' ? '🔴' :
                    pattern.pattern.severity === 'high' ? '🟠' :
                        pattern.pattern.severity === 'medium' ? '🟡' : '🟢';

                console.log(`   ${index + 1}. ${severityIcon} ${pattern.pattern.name} ${trendIcon}`);
                console.log(`      Frequency: ${pattern.frequency}, Trend: ${pattern.trend}`);
            });
        }

        // Anomalies
        if (analysis.anomalies.length > 0) {
            console.log("\n⚠️ Detected Anomalies:");
            analysis.anomalies.slice(0, 3).forEach(anomaly => {
                const severityIcon = anomaly.severity === 'high' ? '🔴' :
                    anomaly.severity === 'medium' ? '🟡' : '🟢';
                console.log(`   ${severityIcon} ${anomaly.description}`);
                console.log(`      Time: ${new Date(anomaly.timestamp).toLocaleString()}`);
            });
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const analyzer = new OpenClawLogAnalyzer();

    try {
        switch (command) {
            case 'analyze':
                const hours = args.includes('--hours') ?
                    parseInt(args[args.indexOf('--hours') + 1]) : undefined;
                const outputPath = args.includes('--output') ?
                    args[args.indexOf('--output') + 1] : undefined;

                console.log("🔍 Analyzing OpenClaw logs...");
                const analysis = analyzer.analyze(hours);

                analyzer.printAnalysis(analysis);

                if (outputPath) {
                    analyzer.generateReport(analysis, outputPath);
                }
                break;

            case 'report':
                const reportHours = args.includes('--hours') ?
                    parseInt(args[args.indexOf('--hours') + 1]) : undefined;
                const reportPath = args[1] || join(homedir(), '.openclaw', 'analysis-report.md');

                console.log("📄 Generating analysis report...");
                const reportAnalysis = analyzer.analyze(reportHours);
                analyzer.generateReport(reportAnalysis, reportPath);
                break;

            default:
                console.log('OpenClaw Log Analyzer');
                console.log('Usage:');
                console.log('  node log-analyzer.ts analyze [--hours N] [--output path]');
                console.log('  node log-analyzer.ts report [output-path] [--hours N]');
                console.log('');
                console.log('Options:');
                console.log('  --hours N    Analyze only the last N hours of logs');
                console.log('  --output     Save detailed report to file');
                console.log('');
                console.log('Examples:');
                console.log('  node log-analyzer.ts analyze --hours 24');
                console.log('  node log-analyzer.ts report analysis.md --hours 12');
                break;
        }
    } catch (error) {
        console.error(`❌ Error: ${error}`);
        process.exit(1);
    }
}

export { OpenClawLogAnalyzer, AnalysisResult };

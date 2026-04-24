# OpenClaw Activity Monitoring & Logging

This document describes the comprehensive activity monitoring and logging solution for tracking OpenClaw system activity, idle states, resource usage, and detailed log analysis.

## Overview

The OpenClaw monitoring solution provides complete visibility into:

- **Activity Monitoring**: Gateway status, session activity, resource usage
- **Log Collection**: Automated collection from multiple log sources
- **Log Analysis**: Pattern detection, anomaly detection, and insights
- **Real-time Monitoring**: Live dashboards and alerts
- **Historical Analysis**: Trends, patterns, and performance metrics

## Components

### 1. Activity Monitor (`scripts/activity-monitor.ts`)
The core monitoring service that:
- Captures system snapshots every 30 seconds (configurable)
- Tracks gateway status, sessions, and resource usage
- Logs activity data to `~/.openclaw/activity-monitor.json`
- Detects and alerts on idle states

### 2. Activity Dashboard (`scripts/activity-dashboard.ts`)
A dashboard for visualizing activity data:
- Current status overview
- Activity history analysis
- Idle period detection
- Resource usage trends
- Live monitoring view

### 3. Log Collector (`scripts/log-collector.ts`)
Automated log collection system:
- Collects logs from multiple sources (files, commands, systemd)
- Parses structured and unstructured log formats
- Filters and aggregates log entries
- Stores in JSONL format for analysis

### 4. Log Viewer (`scripts/log-viewer.ts`)
Advanced log viewing and filtering:
- Real-time log viewing with filters
- Search by level, source, session, time range
- Multiple output formats (JSON, CSV, compact)
- Export capabilities

### 5. Log Analyzer (`scripts/log-analyzer.ts`)
Intelligent log analysis:
- Pattern detection and classification
- Anomaly detection (spikes, gaps, unusual patterns)
- Trend analysis and insights
- Automated recommendations
- Detailed analysis reports

### 6. Control Scripts
- **Linux/macOS**: `scripts/openclaw-monitor.sh`
- **Windows**: `scripts/openclaw-monitor.bat`

Easy-to-use commands for managing all monitoring components.

## Quick Start

### 1. Start Complete Monitoring

**Linux/macOS:**
```bash
# Start both activity monitoring and log collection
./scripts/openclaw-monitor.sh start
./scripts/openclaw-monitor.sh log-start
```

**Windows:**
```cmd
scripts\openclaw-monitor.bat start
scripts\openclaw-monitor.bat log-start
```

### 2. View Current Status

```bash
# Activity status
./scripts/openclaw-monitor.sh status

# Log collection status
./scripts/openclaw-monitor.sh log-status
```

### 3. View Logs and Analysis

```bash
# Recent logs
./scripts/openclaw-monitor.sh show-logs

# Analyze log patterns
./scripts/openclaw-monitor.sh analyze-logs

# Search logs
./scripts/openclaw-monitor.sh search-logs "error"

# Live log monitoring
./scripts/openclaw-monitor.sh watch-logs
```

### 4. Generate Analysis Report

```bash
# Analyze last 24 hours and generate report
node scripts/log-analyzer.ts report analysis-report.md --hours 24
```

## Commands Reference

### Control Script Commands

| Command | Description |
|---------|-------------|
| `start` | Start the activity monitor in background |
| `stop` | Stop the activity monitor |
| `restart` | Restart the activity monitor |
| `status` | Show current OpenClaw status |
| `dashboard` | Show full activity dashboard |
| `live` | Show live monitoring view |
| `history [hours]` | Show activity history (default: 24 hours) |
| `idle` | Analyze idle periods |
| `resources` | Show resource usage analysis |
| `logs` | Show monitor logs |
| `is-running` | Check if monitor is running (exit code 0/1) |

### Log Management Commands

| Command | Description |
|---------|-------------|
| `log-start` | Start log collector |
| `log-stop` | Stop log collector |
| `log-status` | Show log collector status |
| `show-logs` | Show recent collected logs |
| `analyze-logs` | Analyze log patterns and anomalies |
| `watch-logs` | Watch logs in real-time |
| `search-logs <query>` | Search logs for specific patterns |

### Direct Log Commands

| Command | Description |
|---------|-------------|
| `node scripts/log-viewer.ts show [options]` | View logs with filters |
| `node scripts/log-viewer.ts analyze` | Analyze log statistics |
| `node scripts/log-viewer.ts watch` | Real-time log monitoring |
| `node scripts/log-viewer.ts export <path>` | Export logs to file |
| `node scripts/log-analyzer.ts analyze` | Advanced pattern analysis |
| `node scripts/log-analyzer.ts report <path>` | Generate analysis report |

### Log Viewer Filter Options

| Option | Description |
|--------|-------------|
| `--level <levels>` | Filter by log level (error,warn,info,debug) |
| `--source <sources>` | Filter by log source |
| `--session <key>` | Filter by session key |
| `--agent <id>` | Filter by agent ID |
| `--since <minutes>` | Show logs from last N minutes |
| `--grep <pattern>` | Filter by message pattern |
| `--limit <n>` | Limit number of entries |
| `--tail` | Show newest entries first |
| `--json` | Output as JSON |
| `--csv` | Output as CSV |

## Configuration

Edit `scripts/monitor-config.json` to customize:

```json
{
  "monitor": {
    "interval": 30000,          // Monitoring interval (ms)
    "maxLogEntries": 1000,      // Max log entries to keep
    "idleThreshold": 300000,    // Idle threshold (5 minutes)
    "alertOnIdle": true         // Alert when idle detected
  },
  "alerts": {
    "memoryThreshold": 500,     // Memory alert threshold (MB)
    "idleTimeThreshold": 600000, // Long idle alert (10 minutes)
    "enableConsoleAlerts": true
  }
}
```

## Understanding the Data

### Status Indicators

- 🟢 **Running**: Active sessions or recent activity
- 🟡 **Idle**: No active sessions, but system responsive
- 🔴 **Error**: Cannot connect to gateway
- ⚪ **Unknown**: Status unclear

### Activity Metrics

- **Active Sessions**: Number of current agent sessions
- **Active Runs**: Number of running agent executions
- **Memory Usage**: RSS and heap memory consumption
- **Heartbeat**: Whether system heartbeat is active
- **Queued Events**: Number of pending system events

### Idle Detection

The system is considered idle when:
- Gateway status is "idle"
- No active sessions (count = 0)
- No active runs (count = 0)
- No recent activity within threshold

## Automation

### Auto-start with Gateway

The monitoring system includes an auto-start plugin that automatically begins monitoring when the OpenClaw gateway starts:

- **Plugin**: `monitoring-auto-start` (bundled extension)
- **Trigger**: Gateway startup (`gateway_start` hook)
- **Components**: Starts both activity monitor and log collector
- **Smart Detection**: Avoids duplicate processes if already running

The plugin will automatically:
1. Detect the scripts directory location
2. Check for existing monitoring processes
3. Start activity monitor and log collector
4. Provide status and management guidance

### Auto-start with Hooks

The monitoring system includes a hook that automatically starts monitoring when OpenClaw begins a task. The hook is configured as:

- **Event**: `preTaskExecution`
- **Action**: Start activity monitor in background
- **ID**: `activity-monitor-start`

### Integration with CI/CD

For automated environments, you can:

1. **Check if system is idle before deployment:**
```bash
if ./scripts/openclaw-monitor.sh is-running; then
    echo "Monitor is running, checking idle state..."
    # Add logic to check idle state
fi
```

2. **Monitor resource usage during tests:**
```bash
./scripts/openclaw-monitor.sh start
# Run your tests
./scripts/openclaw-monitor.sh resources
./scripts/openclaw-monitor.sh stop
```

3. **Automated log analysis:**
```bash
# Generate analysis report after test runs
node scripts/log-analyzer.ts report test-analysis.md --hours 2
```

## Troubleshooting

### Monitor Won't Start

1. Check if Node.js is available:
```bash
node --version
```

2. Check permissions:
```bash
ls -la scripts/activity-monitor.ts
```

3. Check logs:
```bash
cat ~/.openclaw/monitor.log
```

### No Activity Data

1. Verify monitor is running:
```bash
./scripts/openclaw-monitor.sh is-running
```

2. Check if OpenClaw gateway is accessible:
```bash
openclaw gateway status
```

3. Check log file exists:
```bash
ls -la ~/.openclaw/activity-monitor.json
```

### High Resource Usage

The monitor is designed to be lightweight:
- Runs every 30 seconds by default
- Uses minimal CPU and memory
- Logs are automatically rotated

If you notice high usage:
1. Increase monitoring interval in config
2. Reduce `maxLogEntries` setting
3. Check for multiple monitor instances

## Data Files

| File | Purpose |
|------|---------|
| `~/.openclaw/activity-monitor.json` | Activity monitoring data |
| `~/.openclaw/collected-logs.jsonl` | Collected and parsed logs |
| `~/.openclaw/monitor.log` | Activity monitor process logs |
| `~/.openclaw/log-collector.log` | Log collector process logs |
| `~/.openclaw/monitor.pid` | Activity monitor process ID |
| `~/.openclaw/log-collector.pid` | Log collector process ID |
| `scripts/monitor-config.json` | Configuration settings |

## Log Sources

The log collector automatically gathers logs from:

- **OpenClaw Gateway**: `~/.openclaw/logs/gateway.log`
- **Agent Logs**: `~/.openclaw/logs/agents.log`
- **Session Logs**: `~/.openclaw/logs/sessions.log`
- **Error Logs**: `~/.openclaw/logs/errors.log`
- **CLI Output**: `openclaw logs --json --tail 100`
- **System Journal**: `journalctl -u openclaw` (if using systemd)

## Log Analysis Features

### Pattern Detection
- **Connection Issues**: Network connectivity problems
- **Memory Issues**: Memory allocation failures and leaks
- **Authentication Failures**: Auth/authorization problems
- **Rate Limiting**: API throttling detection
- **Performance Issues**: Slow operations and high resource usage
- **Security Alerts**: Potential security threats
- **System Issues**: Service availability and storage problems

### Anomaly Detection
- **Activity Spikes**: Unusual increases in log volume
- **Logging Gaps**: Periods of missing logs
- **Error Patterns**: Repeated error occurrences
- **Performance Degradation**: Trend analysis

### Insights Generation
- Session activity analysis
- Error rate calculations
- Performance trend identification
- Resource usage patterns
- Security event correlation

## Examples

### Activity Monitoring
```bash
$ ./scripts/openclaw-monitor.sh status
🟢 Monitor Status: Running (PID: 12345)

┌─────────────────────────────────────────────────────────────┐
│                    OpenClaw Activity Status                 │
├─────────────────────────────────────────────────────────────┤
│ Status: 🟡 IDLE     │ Last Update: 15s ago                  │
│ Active Sessions: 0   │ Active Runs: 0                       │
│ Memory Usage: 145.2MB│ Heap: 89.3MB                        │
│ Heartbeat: Active    │ Queued Events: 0                     │
└─────────────────────────────────────────────────────────────┘
```

### Log Analysis
```bash
$ ./scripts/openclaw-monitor.sh analyze-logs

🔍 OpenClaw Log Analysis Results
═══════════════════════════════════════════════════════════

📊 Summary:
   Total Logs: 15,432
   Time Range: 2024-04-23 08:00:00 to 2024-04-23 20:00:00
   Log Rate: 21.43 logs/minute
   Error Rate: 0.85 errors/minute

💡 Key Insights:
   • System handled 45 unique sessions with 1,234 session-related events
   • Error rate: 3.2% (492 errors out of 15,432 total logs)
   • Found 2 critical issue patterns requiring immediate attention

🎯 Recommendations:
   • 🔴 CRITICAL: Address Memory Issues immediately (12 occurrences)
   • 📈 Monitor increasing patterns: Connection Issues, Rate Limiting
   • 💾 Consider increasing memory allocation or investigating memory leaks

🔍 Top Issue Patterns:
   1. 🔴 Memory Issues 📈 (Frequency: 12, Trend: increasing)
   2. 🟠 Connection Issues ➡️ (Frequency: 8, Trend: stable)
   3. 🟡 Rate Limiting 📉 (Frequency: 5, Trend: decreasing)
```

### Real-time Log Monitoring
```bash
$ ./scripts/openclaw-monitor.sh watch-logs
👀 Watching logs (Press Ctrl+C to exit)
────────────────────────────────────────────────────────────

2024-04-23 14:30:15 [INFO] [openclaw-gateway] {agent:main:session1} Session started
2024-04-23 14:30:16 [DEBUG] [openclaw-agents] Agent initialized: gpt-4
2024-04-23 14:30:18 [WARN] [openclaw-gateway] Rate limit approaching for session1
2024-04-23 14:30:20 [ERROR] [openclaw-agents] Memory allocation failed: out of heap space
```

### Log Search and Export
```bash
# Search for errors in the last hour
$ node scripts/log-viewer.ts show --level error --since 60

# Export error logs to CSV
$ node scripts/log-viewer.ts export error-logs.csv --level error --csv

# Generate comprehensive analysis report
$ node scripts/log-analyzer.ts report analysis-report.md --hours 24
📄 Analysis report saved to: analysis-report.md
```

### Idle Analysis
```bash
$ ./scripts/openclaw-monitor.sh idle

🔍 Idle State Analysis
──────────────────────────────────────────────────
Found 3 idle periods:
1. 2024-04-23 14:30:15 - 2h 15m
2. 2024-04-23 09:45:22 - 45m 30s
3. 2024-04-23 08:12:10 - 1h 5m

📈 Idle Statistics:
   Total idle time: 4h 5m 30s
   Idle percentage: 65.2%
   Average idle duration: 1h 21m 50s
```

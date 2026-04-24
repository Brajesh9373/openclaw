# OpenClaw Monitoring Auto-Start Plugin

This plugin automatically starts the OpenClaw activity monitoring and log collection systems when the gateway starts up.

## Features

- **Automatic Startup**: Starts monitoring systems when the gateway initializes
- **Smart Detection**: Checks for existing monitoring processes to avoid duplicates
- **Robust Fallback**: Uses individual scripts if the unified startup manager isn't available
- **Process Management**: Handles process lifecycle and error recovery
- **User Guidance**: Provides helpful commands for manual management

## What Gets Started

When the gateway starts, this plugin automatically launches:

1. **Activity Monitor** (`activity-monitor.ts`)
   - Tracks gateway status and session activity
   - Monitors memory and CPU usage
   - Detects idle states and patterns
   - Logs data to `~/.openclaw/activity-monitor.json`

2. **Log Collector** (`log-collector.ts`)
   - Collects logs from multiple OpenClaw sources
   - Parses structured and unstructured log formats
   - Stores aggregated logs in `~/.openclaw/collected-logs.jsonl`

## Installation

The plugin is automatically available as a bundled extension. To enable it:

1. **Automatic**: The plugin should be enabled by default in OpenClaw installations that include the monitoring scripts.

2. **Manual**: If needed, you can enable it in your OpenClaw configuration:
   ```json
   {
     "plugins": {
       "enabled": ["monitoring-auto-start"]
     }
   }
   ```

## Configuration

The plugin works out of the box with no configuration required. It automatically:

- Detects the correct scripts directory
- Checks for existing monitoring processes
- Handles different deployment scenarios
- Provides fallback mechanisms

## Monitoring Commands

Once the monitoring systems are started, you can use these commands:

```bash
# Check monitoring status
./scripts/openclaw-monitor.sh status

# View activity dashboard
./scripts/openclaw-monitor.sh dashboard

# Show recent logs
./scripts/openclaw-monitor.sh show-logs

# Analyze log patterns
./scripts/openclaw-monitor.sh analyze-logs

# Watch logs in real-time
./scripts/openclaw-monitor.sh watch-logs

# Search logs
./scripts/openclaw-monitor.sh search-logs "error"
```

## Manual Control

If you need to manually control the monitoring systems:

```bash
# Start monitoring (if not auto-started)
./scripts/openclaw-monitor.sh start
./scripts/openclaw-monitor.sh log-start

# Stop monitoring
./scripts/openclaw-monitor.sh stop
./scripts/openclaw-monitor.sh log-stop

# Restart monitoring
./scripts/openclaw-monitor.sh restart
```

## Troubleshooting

### Plugin Not Starting Monitoring

If the plugin doesn't start monitoring automatically:

1. **Check Scripts**: Ensure monitoring scripts exist in the `scripts/` directory
2. **Manual Start**: Use `./scripts/openclaw-monitor.sh start` to start manually
3. **Check Logs**: Look at gateway logs for any error messages from the plugin

### Monitoring Processes Not Found

If you see "Script not found" messages:

1. **Verify Installation**: Ensure you have the complete monitoring solution installed
2. **Check Paths**: Verify the scripts are in the expected location
3. **Permissions**: Ensure scripts have execute permissions (Linux/macOS)

### Duplicate Processes

The plugin checks for existing processes to avoid duplicates, but if you encounter issues:

1. **Check Status**: Run `./scripts/openclaw-monitor.sh status`
2. **Stop All**: Run `./scripts/openclaw-monitor.sh stop` to clean up
3. **Restart Gateway**: Restart the OpenClaw gateway to trigger fresh startup

## Log Files

The plugin and monitoring systems create several log files:

- `~/.openclaw/activity-monitor.json` - Activity monitoring data
- `~/.openclaw/collected-logs.jsonl` - Aggregated log entries
- `~/.openclaw/monitor.log` - Activity monitor process logs
- `~/.openclaw/log-collector.log` - Log collector process logs
- `~/.openclaw/*.pid` - Process ID files

## Integration

This plugin integrates with:

- **Gateway Startup**: Uses the `gateway_start` hook
- **Activity Monitor**: Starts the activity monitoring system
- **Log Collector**: Starts the log collection system
- **Control Scripts**: Works with the unified control scripts

## Development

To modify or extend the plugin:

1. **Edit Plugin**: Modify `extensions/monitoring-auto-start/index.ts`
2. **Test Changes**: Restart the gateway to test plugin changes
3. **Add Features**: Extend the `MonitoringAutoStart` class for new functionality

## Compatibility

- **OpenClaw Version**: Requires OpenClaw 2024.1.0 or later
- **Node.js**: Requires Node.js 18+ for the monitoring scripts
- **Platforms**: Works on Linux, macOS, and Windows
- **Dependencies**: No additional dependencies required

## Support

For issues with the monitoring auto-start plugin:

1. Check the gateway logs for plugin error messages
2. Verify the monitoring scripts are properly installed
3. Test manual startup with the control scripts
4. Report issues with specific error messages and environment details

#!/bin/bash

# OpenClaw Activity Monitor Control Script
# Provides easy commands to monitor OpenClaw activity and idle states

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITOR_SCRIPT="$SCRIPT_DIR/activity-monitor.ts"
DASHBOARD_SCRIPT="$SCRIPT_DIR/activity-dashboard.ts"
LOG_COLLECTOR_SCRIPT="$SCRIPT_DIR/log-collector.ts"
LOG_VIEWER_SCRIPT="$SCRIPT_DIR/log-viewer.ts"
PID_FILE="$HOME/.openclaw/monitor.pid"
LOG_COLLECTOR_PID_FILE="$HOME/.openclaw/log-collector.pid"

show_help() {
    echo "OpenClaw Activity Monitor Control"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  start           Start the activity monitor in background"
    echo "  stop            Stop the activity monitor"
    echo "  restart         Restart the activity monitor"
    echo "  status          Show current OpenClaw status"
    echo "  dashboard       Show activity dashboard"
    echo "  live            Show live monitoring view"
    echo "  history [hours] Show activity history (default: 24 hours)"
    echo "  idle            Analyze idle periods"
    echo "  resources       Show resource usage"
    echo "  logs            Show monitor logs"
    echo "  is-running      Check if monitor is running (exit code 0/1)"
    echo ""
    echo "Log Commands:"
    echo "  log-start       Start log collector"
    echo "  log-stop        Stop log collector"
    echo "  log-status      Show log collector status"
    echo "  show-logs       Show recent logs"
    echo "  analyze-logs    Analyze log patterns"
    echo "  watch-logs      Watch logs in real-time"
    echo "  search-logs <query>  Search logs for pattern"
    echo ""
    echo "Examples:"
    echo "  $0 start                 # Start monitoring"
    echo "  $0 dashboard             # Show current dashboard"
    echo "  $0 history 12            # Show last 12 hours of activity"
    echo "  $0 live                  # Live monitoring view"
    echo "  $0 log-start             # Start log collection"
    echo "  $0 show-logs             # Show recent logs"
    echo "  $0 search-logs error     # Search for error logs"
}

is_monitor_running() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            # PID file exists but process is dead, clean up
            rm -f "$PID_FILE"
            return 1
        fi
    fi
    return 1
}

start_monitor() {
    if is_monitor_running; then
        echo "✅ Activity monitor is already running (PID: $(cat "$PID_FILE"))"
        return 0
    fi

    echo "🚀 Starting OpenClaw activity monitor..."
    
    # Ensure log directory exists
    mkdir -p "$HOME/.openclaw"
    
    # Start monitor in background
    nohup node "$MONITOR_SCRIPT" start > "$HOME/.openclaw/monitor.log" 2>&1 &
    local pid=$!
    
    # Save PID
    echo "$pid" > "$PID_FILE"
    
    # Wait a moment to check if it started successfully
    sleep 2
    
    if is_monitor_running; then
        echo "✅ Activity monitor started successfully (PID: $pid)"
        echo "📝 Logs: $HOME/.openclaw/monitor.log"
        echo "📊 Data: $HOME/.openclaw/activity-monitor.json"
    else
        echo "❌ Failed to start activity monitor"
        echo "Check logs: $HOME/.openclaw/monitor.log"
        return 1
    fi
}

stop_monitor() {
    if ! is_monitor_running; then
        echo "⚠️  Activity monitor is not running"
        return 0
    fi

    local pid=$(cat "$PID_FILE")
    echo "🛑 Stopping activity monitor (PID: $pid)..."
    
    kill "$pid" 2>/dev/null
    
    # Wait for process to stop
    local count=0
    while ps -p "$pid" > /dev/null 2>&1 && [ $count -lt 10 ]; do
        sleep 1
        count=$((count + 1))
    done
    
    if ps -p "$pid" > /dev/null 2>&1; then
        echo "⚠️  Process didn't stop gracefully, force killing..."
        kill -9 "$pid" 2>/dev/null
    fi
    
    rm -f "$PID_FILE"
    echo "✅ Activity monitor stopped"
}

restart_monitor() {
    echo "🔄 Restarting activity monitor..."
    stop_monitor
    sleep 1
    start_monitor
}

show_status() {
    if is_monitor_running; then
        echo "🟢 Monitor Status: Running (PID: $(cat "$PID_FILE"))"
    else
        echo "🔴 Monitor Status: Not running"
    fi
    
    echo ""
    node "$DASHBOARD_SCRIPT" status
}

is_log_collector_running() {
    if [ -f "$LOG_COLLECTOR_PID_FILE" ]; then
        local pid=$(cat "$LOG_COLLECTOR_PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            # PID file exists but process is dead, clean up
            rm -f "$LOG_COLLECTOR_PID_FILE"
            return 1
        fi
    fi
    return 1
}

start_log_collector() {
    if is_log_collector_running; then
        echo "✅ Log collector is already running (PID: $(cat "$LOG_COLLECTOR_PID_FILE"))"
        return 0
    fi

    echo "🚀 Starting OpenClaw log collector..."
    
    # Ensure log directory exists
    mkdir -p "$HOME/.openclaw"
    
    # Start collector in background
    nohup node "$LOG_COLLECTOR_SCRIPT" start > "$HOME/.openclaw/log-collector.log" 2>&1 &
    local pid=$!
    
    # Save PID
    echo "$pid" > "$LOG_COLLECTOR_PID_FILE"
    
    # Wait a moment to check if it started successfully
    sleep 2
    
    if is_log_collector_running; then
        echo "✅ Log collector started successfully (PID: $pid)"
        echo "📝 Logs: $HOME/.openclaw/log-collector.log"
        echo "📊 Data: $HOME/.openclaw/collected-logs.jsonl"
    else
        echo "❌ Failed to start log collector"
        echo "Check logs: $HOME/.openclaw/log-collector.log"
        return 1
    fi
}

stop_log_collector() {
    if ! is_log_collector_running; then
        echo "⚠️  Log collector is not running"
        return 0
    fi

    local pid=$(cat "$LOG_COLLECTOR_PID_FILE")
    echo "🛑 Stopping log collector (PID: $pid)..."
    
    kill "$pid" 2>/dev/null
    
    # Wait for process to stop
    local count=0
    while ps -p "$pid" > /dev/null 2>&1 && [ $count -lt 10 ]; do
        sleep 1
        count=$((count + 1))
    done
    
    if ps -p "$pid" > /dev/null 2>&1; then
        echo "⚠️  Process didn't stop gracefully, force killing..."
        kill -9 "$pid" 2>/dev/null
    fi
    
    rm -f "$LOG_COLLECTOR_PID_FILE"
    echo "✅ Log collector stopped"
}

show_log_status() {
    if is_log_collector_running; then
        echo "🟢 Log Collector Status: Running (PID: $(cat "$LOG_COLLECTOR_PID_FILE"))"
    else
        echo "🔴 Log Collector Status: Not running"
    fi
    
    # Show log file info
    local log_file="$HOME/.openclaw/collected-logs.jsonl"
    if [ -f "$log_file" ]; then
        local size=$(du -h "$log_file" | cut -f1)
        local lines=$(wc -l < "$log_file")
        echo "📊 Log File: $size ($lines entries)"
    else
        echo "📊 Log File: Not found"
    fi
}

show_recent_logs() {
    echo "📋 Recent OpenClaw Logs:"
    node "$LOG_VIEWER_SCRIPT" show --limit 50 --tail
}

analyze_logs() {
    echo "📊 Log Analysis:"
    node "$LOG_VIEWER_SCRIPT" analyze
}

watch_logs() {
    echo "👀 Watching OpenClaw logs (Press Ctrl+C to exit):"
    node "$LOG_VIEWER_SCRIPT" watch
}

search_logs() {
    local query="$1"
    if [ -z "$query" ]; then
        echo "Usage: $0 search-logs <query>"
        return 1
    fi
    
    echo "🔍 Searching logs for: $query"
    node "$LOG_VIEWER_SCRIPT" show --grep "$query" --limit 100
}

show_logs() {
    local log_file="$HOME/.openclaw/monitor.log"
    
    if [ ! -f "$log_file" ]; then
        echo "❌ No monitor log file found at $log_file"
        return 1
    fi
    
    echo "📝 Monitor Logs (last 50 lines):"
    echo "─────────────────────────────────"
    tail -n 50 "$log_file"
}

# Main command handling
case "${1:-help}" in
    start)
        start_monitor
        ;;
    stop)
        stop_monitor
        ;;
    restart)
        restart_monitor
        ;;
    status)
        show_status
        ;;
    dashboard)
        node "$DASHBOARD_SCRIPT" full
        ;;
    live)
        node "$DASHBOARD_SCRIPT" live
        ;;
    history)
        node "$DASHBOARD_SCRIPT" history "${2:-24}"
        ;;
    idle)
        node "$DASHBOARD_SCRIPT" idle
        ;;
    resources)
        node "$DASHBOARD_SCRIPT" resources
        ;;
    logs)
        show_logs
        ;;
    log-start)
        start_log_collector
        ;;
    log-stop)
        stop_log_collector
        ;;
    log-status)
        show_log_status
        ;;
    show-logs)
        show_recent_logs
        ;;
    analyze-logs)
        analyze_logs
        ;;
    watch-logs)
        watch_logs
        ;;
    search-logs)
        search_logs "$2"
        ;;
    is-running)
        if is_monitor_running; then
            exit 0
        else
            exit 1
        fi
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "❌ Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac

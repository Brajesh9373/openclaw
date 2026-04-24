/**
 * Simple test for the monitoring auto-start plugin
 */

import { gateway_start, monitoringAutoStart } from './index.js';
import type { PluginHookGatewayStartEvent, PluginHookGatewayContext } from '../../src/plugins/hook-types.js';

async function testPlugin() {
    console.log('🧪 Testing Monitoring Auto-Start Plugin...');

    // Mock event and context
    const mockEvent: PluginHookGatewayStartEvent = {
        port: 18789
    };

    const mockContext: PluginHookGatewayContext = {
        port: 18789,
        config: {},
        workspaceDir: process.cwd()
    };

    try {
        console.log('📞 Calling gateway_start hook...');
        await gateway_start(mockEvent, mockContext);

        console.log('✅ Plugin test completed successfully');
        console.log('ℹ️  Note: Actual monitoring processes may take a few seconds to start');

    } catch (error) {
        console.error('❌ Plugin test failed:', error);
        process.exit(1);
    }
}

// Run test if this file is executed directly
if (require.main === module) {
    testPlugin().catch(console.error);
}

export { testPlugin };

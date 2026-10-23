import type {
  GlobalMcpServerConfig,
  McpServerTestResult,
} from '@wow/agent-core-v2/app/mcpManagement/mcpManagement';
import type {
  McpRegistryPluginOrigin,
  McpServerSource,
} from '@wow/agent-core-v2/app/mcpRegistry/mcpRegistry';

export type { McpServerSource };
export type McpTestResult = McpServerTestResult;
export type McpServerConfig = GlobalMcpServerConfig;

export type McpManagedServerInfo = McpServerConfig & {
  readonly source: McpServerSource;
  readonly origin: string;
  readonly mutable: boolean;
  readonly plugin?: McpRegistryPluginOrigin;
  readonly envKeys?: readonly string[];
  readonly headerKeys?: readonly string[];
};

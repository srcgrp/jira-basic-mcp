#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type Tool, // Correct type name
  type CallToolRequest // Import specific request type
} from '@modelcontextprotocol/sdk/types.js';
import { Version2Client, AgileClient } from 'jira.js';
import dotenv from 'dotenv';
import { Ajv, type ValidateFunction } from 'ajv';

// Load environment variables from .env file
dotenv.config();

const ajv = new Ajv();

// --- Jira Configuration ---
const JIRA_HOST = process.env.JIRA_HOST;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

if (!JIRA_HOST || !JIRA_EMAIL || !JIRA_API_TOKEN) {
  console.error(
    'Error: JIRA_HOST, JIRA_EMAIL, and JIRA_API_TOKEN environment variables are required.'
  );
  console.error('Please create a .env file with these values: JIRA_HOST, JIRA_EMAIL, and JIRA_API_TOKEN.');
  process.exit(1); // Exit if configuration is missing
}

// --- Jira Client Initialization ---
const jiraClient = new Version2Client({
  host: JIRA_HOST,
  authentication: {
    personalAccessToken: JIRA_API_TOKEN!,
  },
  // newErrorHandling: true, // Removed - Handled via try/catch
});

const agileClient = new AgileClient({
  host: JIRA_HOST,
  authentication: {
    personalAccessToken: JIRA_API_TOKEN!,
  },
});

// --- Tool Definitions ---
const tools: Tool[] = [ // Use correct type Tool
  {
    name: 'delete_issue',
    description: 'Delete a Jira issue or subtask',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'Key of the issue to delete (e.g., "PROJ-123")',
        },
      },
      required: ['issueKey'],
    },
  },
  {
    name: 'get_issues',
    description: 'Get all issues and subtasks for a project or rapid view',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: {
          type: 'string',
          description: 'Project key (e.g., "PROJ")',
        },
        rapidView: {
          oneOf: [
            {
              type: 'number',
              description: 'Rapid view ID (e.g., 117)',
              minimum: 1
            },
            {
              type: 'string',
              description: 'Rapid view ID as string (e.g., "117")',
              pattern: '^\\d+$'
            }
          ]
        },
        jql: {
          type: 'string',
          description: 'Optional JQL query to filter issues',
        },
      },
      anyOf: [
        { required: ['projectKey'] },
        { required: ['rapidView'] }
      ]
    },
  },
  {
    name: 'update_issue',
    description: 'Update an existing Jira issue',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'Key of the issue to update (e.g., "PROJ-123")',
        },
        summary: { type: 'string', description: 'New summary/title' },
        description: { type: 'string', description: 'New description (ADF format recommended)' },
        assignee: { type: 'string', description: 'Account ID of the new assignee (use get_user to find)' }, // Changed to Account ID
        status: { type: 'string', description: 'New status name (requires transition ID internally)' }, // Note: Status change needs transition
        priority: { type: 'string', description: 'New priority name' },
        // Add other updatable fields as needed, checking Jira API docs
      },
      required: ['issueKey'],
      minProperties: 2, // Must provide issueKey and at least one field to update
    },
  },
  {
    name: 'list_fields',
    description: 'List all available fields in the Jira instance',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_issue_types',
    description: 'List all available issue types',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_link_types',
    description: 'List all available issue link types',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_user',
    description: "Get a user's account ID by email address",
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: "User's email address" },
      },
      required: ['email'],
    },
  },
  {
    name: 'create_issue',
    description: 'Create a new Jira issue',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Project key (e.g., "PROJ")' },
        summary: { type: 'string', description: 'Issue summary/title' },
        issueType: { type: 'string', description: 'Name of the issue type (e.g., "Task", "Bug")' },
        description: { type: 'string', description: 'Detailed description (ADF format recommended)' },
        assignee: { type: 'string', description: 'Account ID of the assignee (use get_user to find)' }, // Changed to Account ID
        labels: { type: 'array', items: { type: 'string' }, description: 'Array of labels' },
        components: { type: 'array', items: { type: 'string' }, description: 'Array of component names' },
        priority: { type: 'string', description: 'Issue priority name' },
        // Add other creatable fields as needed
      },
      required: ['projectKey', 'summary', 'issueType'],
    },
  },
  {
    name: 'create_issue_link',
    description: 'Create a link between two issues',
    inputSchema: {
      type: 'object',
      properties: {
        inwardIssueKey: { type: 'string', description: 'Key of the inward issue (e.g., "PROJ-123")' },
        outwardIssueKey: { type: 'string', description: 'Key of the outward issue (e.g., "PROJ-456")' },
        linkType: { type: 'string', description: 'Name of the link type (e.g., "Blocks")' },
      },
      required: ['inwardIssueKey', 'outwardIssueKey', 'linkType'],
    },
  },
];

// --- MCP Server Implementation ---
export class JiraMcpServer {
  private server: Server;
  private toolValidators: Map<string, ValidateFunction>;

  constructor() {
    this.server = new Server(
      {
        name: 'jira-mcp-server', // Consistent naming
        version: '0.1.0',
      },
      {
        capabilities: {
          resources: {}, // No resources defined for now
          tools: {}, // Tools will be handled dynamically
        },
      }
    );

    this.toolValidators = new Map();
    this.setupToolHandlers();

    // Basic error logging
    this.server.onerror = (error: any) => console.error('[MCP Server Error]', error); // Add type for error
    process.on('SIGINT', async () => {
      console.error('Shutting down Jira MCP server...');
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    // Compile validators for each tool's input schema
    tools.forEach(tool => {
      if (tool.inputSchema) {
        this.toolValidators.set(tool.name, ajv.compile(tool.inputSchema));
      }
    });

    // Handler for listing available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

    // Handler for calling a specific tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => { // Add type for request
      const toolName = request.params.name;
      const args = request.params.arguments as any;
      console.error(`Received call for tool: ${toolName} with args:`, JSON.stringify(args));

      const toolDefinition = tools.find(t => t.name === toolName);
      if (!toolDefinition) {
        throw new McpError(ErrorCode.MethodNotFound, `Tool "${toolName}" not found.`);
      }

      // Validate input arguments
      const validator = this.toolValidators.get(toolName);
      if (validator && !validator(args)) {
         console.error(`Invalid arguments for tool ${toolName}:`, ajv.errorsText(validator.errors));
         throw new McpError(
           ErrorCode.InvalidParams,
           `Invalid arguments for tool ${toolName}: ${ajv.errorsText(validator.errors)}`
         );
      }


      try {
        let result: any;
        switch (toolName) {
          case 'delete_issue':
            result = await jiraClient.issues.deleteIssue({ issueIdOrKey: args.issueKey });
            // Delete returns no content on success (204)
            result = { success: true, message: `Issue ${args.issueKey} deleted successfully.` };
            break;
          case 'get_issues':
            let jql = '';
            if (args.rapidView) {
              // Get issues from rapid view
              // Get board details
              // Convert to number if string, or use directly if already number
              const boardId = typeof args.rapidView === 'string' 
                ? parseInt(args.rapidView, 10)
                : args.rapidView;
              
              if (!Number.isInteger(boardId) || boardId <= 0) {
                throw new McpError(
                  ErrorCode.InvalidParams, 
                  `Invalid rapidView ID: ${args.rapidView}. Must be a positive integer.`
                );
              }
              
              const board = await agileClient.board.getBoard({ boardId });
              
              // Get board configuration to find the filter ID
              const config = await agileClient.board.getConfiguration({ boardId });
              if (!config.filter?.id) {
                throw new McpError(ErrorCode.InvalidParams, `Board ${boardId} has no filter configured`);
              }
              
              // Get the filter to extract the JQL
              const filterResponse = await jiraClient.filters.getFilter({ id: Number(config.filter.id) });
              const filter = filterResponse as unknown as { jql: string };
              if (!filter.jql) {
                throw new McpError(ErrorCode.InvalidParams, `Filter ${config.filter.id} has no JQL configured`);
              }
              // Combine board JQL with user-provided JQL
              jql = args.jql ? `${filter.jql} AND (${args.jql})` : filter.jql;
            } else if (args.projectKey) {
              // Get issues from project
              jql = args.jql ? `project = "${args.projectKey}" AND ${args.jql}` : `project = "${args.projectKey}"`;
            } else {
              throw new McpError(ErrorCode.InvalidParams, 'Either projectKey or rapidView must be provided');
            }
            result = await jiraClient.issueSearch.searchForIssuesUsingJql({ jql });
            break;
          case 'update_issue':
            result = await this.handleUpdateIssue(args);
            break;
          case 'list_fields':
            result = await jiraClient.issueFields.getFields();
            break;
          case 'list_issue_types':
            result = await jiraClient.issueTypes.getIssueAllTypes();
            break;
          case 'list_link_types':
            result = await jiraClient.issueLinkTypes.getIssueLinkTypes();
            break;
          case 'get_user':
            // Use userSearch.findUsers in v3+
            const users = await jiraClient.userSearch.findUsers({ query: args.email, maxResults: 1 });
             // Cast users to any[] to handle potential type mismatch from jira.js
             const foundUsers = users as any[];
             if (foundUsers.length > 0 && foundUsers[0].emailAddress?.toLowerCase() === args.email.toLowerCase()) {
               result = foundUsers[0]; // Return the full user object, including accountId
             } else {
               // Use InvalidRequest for resource not found type errors
               throw new McpError(ErrorCode.InvalidRequest, `User with email "${args.email}" not found.`);
             }
            break;
          case 'create_issue':
            result = await this.handleCreateIssue(args);
            break;
          case 'create_issue_link':
            result = await jiraClient.issueLinks.linkIssues({
              type: { name: args.linkType },
              inwardIssue: { key: args.inwardIssueKey },
              outwardIssue: { key: args.outwardIssueKey },
            });
             // Link returns no content on success (201)
            result = { success: true, message: `Link '${args.linkType}' created between ${args.inwardIssueKey} and ${args.outwardIssueKey}.` };
            break;
          default:
            // Should not happen due to earlier check, but good practice
            throw new McpError(ErrorCode.MethodNotFound, `Handler for tool "${toolName}" not implemented.`);
        }

        console.error(`Tool ${toolName} executed successfully.`);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        console.error(`Error executing tool ${toolName}:`, error);
        // Attempt to extract Jira API error details
        const errorMessage = error?.errorMessages?.join(', ') || error?.message || 'An unknown error occurred';
        const statusCode = error?.status || 500; // Default to 500 if status is not available

        // Map Jira errors to MCP errors where possible
        let mcpErrorCode = ErrorCode.InternalError;
        if (statusCode === 400) {
            mcpErrorCode = ErrorCode.InvalidParams;
        } else if (statusCode === 401 || statusCode === 403) {
            // Use InvalidRequest for permission issues
            mcpErrorCode = ErrorCode.InvalidRequest;
        } else if (statusCode === 404) {
             // Use InvalidRequest for resource not found
            mcpErrorCode = ErrorCode.InvalidRequest;
        }


        // Throwing McpError ensures the error is correctly formatted for the client
         throw new McpError(
             mcpErrorCode,
             `Jira API Error (${statusCode}): ${errorMessage}`,
             { originalError: error } // Optional: include original error details
         );
      }
    });
  }

  // --- Specific Tool Handlers with Complex Logic ---

  private async handleCreateIssue(args: any) {
    const { projectKey, summary, issueType, description, assignee, labels, components, priority } = args;

    // 1. Find Project ID
    // Note: Creating issues often requires IDs, not keys/names.
    // This adds complexity as we need to look up IDs first.
    let projectId: string | undefined;
    try {
        const project = await jiraClient.projects.getProject({ projectIdOrKey: projectKey });
        projectId = project.id;
    } catch (e) {
        throw new McpError(ErrorCode.InvalidParams, `Could not find project with key "${projectKey}".`);
    }
    if (!projectId) throw new McpError(ErrorCode.InternalError, `Failed to resolve project ID for key "${projectKey}".`);


    // 2. Find Issue Type ID
    let issueTypeId: string | undefined;
     try {
         const issueTypes = await jiraClient.issueTypes.getIssueAllTypes(); // Consider project-specific types if needed
         const foundType = issueTypes.find(it => it.name?.toLowerCase() === issueType.toLowerCase());
         if (!foundType || !foundType.id) {
             throw new McpError(ErrorCode.InvalidParams, `Issue type "${issueType}" not found or has no ID.`);
         }
         issueTypeId = foundType.id;
     } catch (e: any) {
         throw new McpError(ErrorCode.InternalError, `Failed to resolve issue type ID for "${issueType}": ${e.message}`);
     }


    // 3. Find Priority ID (if provided)
    let priorityId: string | undefined;
    if (priority) {
        try {
            const priorities = await jiraClient.issuePriorities.getPriorities();
            const foundPriority = priorities.find(p => p.name?.toLowerCase() === priority.toLowerCase());
            if (!foundPriority || !foundPriority.id) {
                console.warn(`Priority "${priority}" not found, issue will be created without priority.`);
                // Don't throw, just skip setting priority
            } else {
                 priorityId = foundPriority.id;
            }
        } catch (e: any) {
             console.warn(`Failed to resolve priority ID for "${priority}", issue will be created without priority: ${e.message}`);
        }
    }

    // 4. Find Component IDs (if provided)
    let componentObjects: { id: string }[] = []; // Initialize as empty array
    if (components && components.length > 0 && projectId) {
        try {
            const projectComponents = await jiraClient.projectComponents.getProjectComponents({ projectIdOrKey: projectId });
            componentObjects = components
                .map((compName: string) => {
                    const foundComp = projectComponents.find(pc => pc.name?.toLowerCase() === compName.toLowerCase());
                    if (!foundComp || !foundComp.id) {
                        console.warn(`Component "${compName}" not found in project ${projectKey}, skipping.`);
                        return null;
                    }
                    return { id: foundComp.id };
                })
                .filter((comp: { id: string } | null): comp is { id: string } => comp !== null); // Type guard
        } catch (e: any) {
            console.warn(`Failed to resolve component IDs for project ${projectKey}, issue will be created without components: ${e.message}`);
        }
    }

    // 5. Construct fields object step-by-step
    const fields: any = { // Declare fields first
        project: { id: projectId },
        summary,
        issuetype: { id: issueTypeId },
    };
    
    // Add optional fields conditionally
    if (description) fields.description = description; 
    if (assignee) fields.assignee = { accountId: assignee }; 
    if (labels) fields.labels = labels;
    if (componentObjects.length > 0) { // Check and add components after fields is declared
        fields.components = componentObjects;
    }
    if (priorityId) fields.priority = { id: priorityId };

    const payload: any = { fields }; // Construct final payload

    console.error("Creating issue with payload:", JSON.stringify(payload, null, 2));

    // 6. Call Jira API
    return jiraClient.issues.createIssue(payload);
  }

  private async handleUpdateIssue(args: any) {
    const { issueKey, summary, description, assignee, status, priority } = args;

    const fieldsToUpdate: any = {};

    if (summary) fieldsToUpdate.summary = summary;
    if (description) fieldsToUpdate.description = description; // ADF format preferred

    // Resolve Assignee Account ID if email provided (using get_user logic)
    if (assignee) {
       // Jira update requires accountId for assignee
       fieldsToUpdate.assignee = { accountId: assignee }; // Assuming assignee is already accountId
    }


    // Resolve Priority ID if name provided
    if (priority) {
        try {
            const priorities = await jiraClient.issuePriorities.getPriorities();
            const foundPriority = priorities.find(p => p.name?.toLowerCase() === priority.toLowerCase());
            if (foundPriority?.id) {
                fieldsToUpdate.priority = { id: foundPriority.id };
            } else {
                console.warn(`Priority "${priority}" not found, skipping update.`);
            }
        } catch (e: any) {
             console.warn(`Failed to resolve priority ID for "${priority}", skipping update: ${e.message}`);
        }
    }

    // --- Status Change (Transition) ---
    // This is the most complex part of updating. It requires finding the correct transition ID.
    let transitionId: string | undefined;
    if (status) {
        try {
            const transitions = await jiraClient.issues.getTransitions({ issueIdOrKey: issueKey });
            const targetTransition = transitions.transitions?.find(t => t.to?.name?.toLowerCase() === status.toLowerCase());
            if (targetTransition?.id) {
                transitionId = targetTransition.id;
            } else {
                 console.warn(`Transition to status "${status}" not available for issue ${issueKey}. Available transitions: ${transitions.transitions?.map(t => t.to?.name).join(', ')}`);
                 // Don't throw, just skip status change if transition not found
            }
        } catch (e: any) {
            console.warn(`Failed to get transitions for issue ${issueKey}, cannot change status: ${e.message}`);
        }
    }

    // Perform field updates first (if any)
    if (Object.keys(fieldsToUpdate).length > 0) {
        console.error(`Updating issue ${issueKey} with fields:`, JSON.stringify(fieldsToUpdate));
        await jiraClient.issues.editIssue({
            issueIdOrKey: issueKey,
            fields: fieldsToUpdate,
        });
    } else if (!transitionId) {
         // Nothing to update and no transition found
         return { success: true, message: `No valid fields or status transition provided for issue ${issueKey}. No update performed.` };
    }


    // Perform transition if found
    if (transitionId) {
        console.error(`Transitioning issue ${issueKey} to status "${status}" (Transition ID: ${transitionId})`);
        await jiraClient.issues.doTransition({
            issueIdOrKey: issueKey,
            transition: { id: transitionId },
            // Optionally add fields specific to the transition screen if needed
            // fields: { resolution: { name: "Done" } } // Example
        });
    }

    // Fetch the updated issue to return its current state
    // Note: editIssue and doTransition don't return the full updated issue
    const updatedIssue = await jiraClient.issues.getIssue({ issueIdOrKey: issueKey });
    return updatedIssue;

  }


  // --- Server Start ---
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Jira MCP server running and connected via stdio.'); // Log to stderr so it doesn't interfere with stdout JSON communication
  }

  async close() {
    await this.server.close();
  }
}

// --- Main Execution ---
const server = new JiraMcpServer();
server.run().catch((error) => {
  console.error('Failed to start Jira MCP server:', error);
  process.exit(1);
});

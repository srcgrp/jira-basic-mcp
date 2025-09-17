import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { Version2Client, AgileClient } from "jira.js";
import dotenv from "dotenv";
import { Ajv } from "ajv";

const ajv = new Ajv();

let jiraClient: Version2Client;
let agileClient: AgileClient;

// Define tools
const tools = [
  {
    name: "delete_issue",
    description: "Delete a Jira issue or subtask",
    inputSchema: {
      type: "object",
      properties: {
        issueKey: {
          type: "string",
          description: 'Key of the issue to delete (e.g., "PROJ-123")',
        },
      },
      required: ["issueKey"],
      additionalProperties: false,
    },
  },
  {
    name: "get_issues",
    description: "Get all issues and subtasks for a project or rapid view",
    inputSchema: {
      type: "object",
      properties: {
        projectKey: {
          type: "string",
          description: 'Project key (e.g., "PROJ")',
        },
        rapidView: {
          oneOf: [
            {
              type: "number",
              description: "Rapid view ID (e.g., 117)",
              minimum: 1,
            },
            {
              type: "string",
              description: 'Rapid view ID as string (e.g., "117")',
              pattern: "^\\d+$",
            },
          ],
        },
        jql: {
          type: "string",
          description: "Optional JQL query to filter issues",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_assigned_issues",
    description:
      "Get issues assigned to a user, with options to filter by assignment status (current, past, or all).",
    inputSchema: {
      type: "object",
      properties: {
        accountId: {
          type: "string",
          description:
            "The account ID of the user to find issues for. Use get_user to find this.",
        },
        status: {
          type: "string",
          description:
            'Filter by assignment status: "current" (default), "past", or "all".',
          enum: ["current", "past", "all"],
        },
        additionalJql: {
          type: "string",
          description:
            'Optional additional JQL query to combine with the assignee search (e.g., "project = PROJ").',
        },
      },
      required: ["accountId"],
      additionalProperties: false,
    },
  },
  {
    name: "update_issue",
    description: "Update an existing Jira issue",
    inputSchema: {
      type: "object",
      properties: {
        issueKey: {
          type: "string",
          description: 'Key of the issue to update (e.g., "PROJ-123")',
        },
        summary: { type: "string", description: "New summary/title" },
        description: {
          type: "string",
          description: "New description (ADF format recommended)",
        },
        assignee: {
          type: "string",
          description: "Account ID of the new assignee (use get_user to find)",
        },
        status: {
          type: "string",
          description: "New status name (requires transition ID internally)",
        },
        priority: { type: "string", description: "New priority name" },
      },
      required: ["issueKey"],
      minProperties: 2, // Must provide issueKey and at least one field to update
      additionalProperties: false,
    },
  },
  {
    name: "list_fields",
    description: "List all available fields in the Jira instance",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "list_issue_types",
    description: "List all available issue types",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "list_link_types",
    description: "List all available issue link types",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "get_user",
    description: "Get a user's account ID by email address",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "User's email address" },
      },
      required: ["email"],
      additionalProperties: false,
    },
  },
  {
    name: "create_issue",
    description: "Create a new Jira issue",
    inputSchema: {
      type: "object",
      properties: {
        projectKey: {
          type: "string",
          description: 'Project key (e.g., "PROJ")',
        },
        summary: { type: "string", description: "Issue summary/title" },
        issueType: {
          type: "string",
          description: 'Name of the issue type (e.g., "Task", "Bug")',
        },
        description: {
          type: "string",
          description: "Detailed description (ADF format recommended)",
        },
        assignee: {
          type: "string",
          description: "Account ID of the assignee (use get_user to find)",
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description: "Array of labels",
        },
        components: {
          type: "array",
          items: { type: "string" },
          description: "Array of component names",
        },
        priority: { type: "string", description: "Issue priority name" },
      },
      required: ["projectKey", "summary", "issueType"],
      additionalProperties: false,
    },
  },
  {
    name: "create_issue_link",
    description: "Create a link between two issues",
    inputSchema: {
      type: "object",
      properties: {
        inwardIssueKey: {
          type: "string",
          description: 'Key of the inward issue (e.g., "PROJ-123")',
        },
        outwardIssueKey: {
          type: "string",
          description: 'Key of the outward issue (e.g., "PROJ-456")',
        },
        linkType: {
          type: "string",
          description: 'Name of the link type (e.g., "Blocks")',
        },
      },
      required: ["inwardIssueKey", "outwardIssueKey", "linkType"],
      additionalProperties: false,
    },
  },
  {
    name: "get_issue",
    description: "Get a specific Jira issue by key",
    inputSchema: {
      type: "object",
      properties: {
        issueKey: {
          type: "string",
          description: 'Key of the issue to retrieve (e.g., "PROJ-123")',
        },
      },
      required: ["issueKey"],
      additionalProperties: false,
    },
  },
];

// Create validators for each tool's input schema
const toolValidators = new Map();
tools.forEach((tool) => {
  if (tool.inputSchema) {
    toolValidators.set(tool.name, ajv.compile(tool.inputSchema));
  }
});

// Create and configure MCP server
const server = new Server(
  {
    name: "jira-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

// Set up request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name } = request.params;
  const args = request.params.arguments || {}; // Normalize args
  console.error(
    `Received call for tool: ${name} with args:`,
    JSON.stringify(args, null, 2)
  );

  // Find tool definition
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    throw new McpError(ErrorCode.MethodNotFound, `Tool "${name}" not found.`);
  }

  // Validate arguments
  const validator = toolValidators.get(name);
  if (validator && !validator(args)) {
    console.error(
      `Invalid arguments for tool ${name}:`,
      ajv.errorsText(validator.errors)
    );
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid arguments for tool ${name}: ${ajv.errorsText(validator.errors)}`
    );
  }

  // Handle tool calls
  try {
    let result;

    switch (name) {
      case "delete_issue": {
        result = await jiraClient.issues.deleteIssue({
          issueIdOrKey: args.issueKey,
        });
        // Delete returns no content on success (204)
        result = {
          success: true,
          message: `Issue ${args.issueKey} deleted successfully.`,
        };
        break;
      }

      case "get_issues": {
        let jql = "";
        if (args.rapidView) {
          // Get issues from rapid view
          // Get board details
          // Convert to number if string, or use directly if already number
          const boardId =
            typeof args.rapidView === "string"
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
            throw new McpError(
              ErrorCode.InvalidParams,
              `Board ${boardId} has no filter configured`
            );
          }

          // Get the filter to extract the JQL
          const filterResponse = await jiraClient.filters.getFilter({
            id: Number(config.filter.id),
          });
          const filter = filterResponse as unknown as { jql: string };
          if (!filter.jql) {
            throw new McpError(
              ErrorCode.InvalidParams,
              `Filter ${config.filter.id} has no JQL configured`
            );
          }
          // Combine board JQL with user-provided JQL
          jql = args.jql ? `${filter.jql} AND (${args.jql})` : filter.jql;
        } else if (args.projectKey) {
          // Get issues from project
          jql = args.jql
            ? `project = "${args.projectKey}" AND ${args.jql}`
            : `project = "${args.projectKey}"`;
        } else {
          throw new McpError(
            ErrorCode.InvalidParams,
            "Either projectKey or rapidView must be provided"
          );
        }
        result = await jiraClient.issueSearch.searchForIssuesUsingJql({ jql });
        break;
      }

      case "get_assigned_issues": {
        const { accountId, status, additionalJql } = args;
        let baseJql: string;

        switch (status) {
          case "past":
            baseJql = `assignee WAS "${accountId}"`;
            break;
          case "all":
            baseJql = `(assignee = "${accountId}" OR assignee WAS "${accountId}")`;
            break;
          default: // 'current' or undefined
            baseJql = `assignee = "${accountId}"`;
        }

        const jql = additionalJql
          ? `${baseJql} AND (${additionalJql})`
          : baseJql;
        result = await jiraClient.issueSearch.searchForIssuesUsingJql({ jql });
        break;
      }

      case "update_issue": {
        const { issueKey, summary, description, assignee, status, priority } =
          args;

        const fieldsToUpdate: any = {};

        if (summary) fieldsToUpdate.summary = summary;
        if (description) fieldsToUpdate.description = description; // ADF format preferred

        // Handle assignee separately - try different approaches
        let assigneeUpdated = false;
        if (assignee !== undefined) {
          try {
            // Try using the assignUser method (if it exists)
            console.log(
              `Attempting to assign issue ${issueKey} to ${assignee}`
            );

            if (assignee === null || assignee === "null") {
              // For unassigning, try setting to null in the field update
              console.log(`Unassigning issue ${issueKey}`);
              fieldsToUpdate.assignee = null;
            } else {
              // Try different account ID formats
              console.log(`Assigning issue ${issueKey} to ${assignee}`);

              // For server instances, use name field instead of accountId
              fieldsToUpdate.assignee = { name: assignee };
            }
          } catch (error: any) {
            console.error(
              `Error preparing assignee for issue ${issueKey}:`,
              error.message
            );
          }
        }

        // Resolve Priority ID if name provided
        if (priority) {
          try {
            const priorities = await jiraClient.issuePriorities.getPriorities();
            const foundPriority = priorities.find(
              (p) => p.name?.toLowerCase() === priority.toLowerCase()
            );
            if (foundPriority?.id) {
              fieldsToUpdate.priority = { id: foundPriority.id };
            } else {
              console.warn(
                `Priority "${priority}" not found, skipping update.`
              );
            }
          } catch (e: any) {
            console.warn(
              `Failed to resolve priority ID for "${priority}", skipping update: ${e.message}`
            );
          }
        }

        // --- Status Change (Transition) ---
        // This is the most complex part of updating. It requires finding the correct transition ID.
        let transitionId: string | undefined;
        if (status) {
          try {
            const transitions = await jiraClient.issues.getTransitions({
              issueIdOrKey: issueKey,
            });
            const targetTransition = transitions.transitions?.find(
              (t) => t.to?.name?.toLowerCase() === status.toLowerCase()
            );
            if (targetTransition?.id) {
              transitionId = targetTransition.id;
            } else {
              console.warn(
                `Transition to status "${status}" not available for issue ${issueKey}. Available transitions: ${transitions.transitions
                  ?.map((t) => t.to?.name)
                  .join(", ")}`
              );
              // Don't throw, just skip status change if transition not found
            }
          } catch (e: any) {
            console.warn(
              `Failed to get transitions for issue ${issueKey}, cannot change status: ${e.message}`
            );
          }
        }

        // Perform field updates first (if any)
        if (Object.keys(fieldsToUpdate).length > 0) {
          console.log(
            `Updating issue ${issueKey} with fields:`,
            JSON.stringify(fieldsToUpdate)
          );
          try {
            await jiraClient.issues.editIssue({
              issueIdOrKey: issueKey,
              fields: fieldsToUpdate,
            });
          } catch (error: any) {
            console.error(`Error updating issue ${issueKey}:`, error.message);
            if (error.response?.data) {
              console.error(
                "Error details:",
                JSON.stringify(error.response.data, null, 2)
              );
            }
            throw error;
          }
        } else if (!transitionId) {
          // Nothing to update and no transition found
          return {
            success: true,
            message: `No valid fields or status transition provided for issue ${issueKey}. No update performed.`,
          };
        }

        // Perform transition if found
        if (transitionId) {
          console.error(
            `Transitioning issue ${issueKey} to status "${status}" (Transition ID: ${transitionId})`
          );
          await jiraClient.issues.doTransition({
            issueIdOrKey: issueKey,
            transition: { id: transitionId },
          });
        }

        // Fetch the updated issue to return its current state
        result = await jiraClient.issues.getIssue({ issueIdOrKey: issueKey });
        break;
      }

      case "list_fields":
        result = await jiraClient.issueFields.getFields();
        break;

      case "list_issue_types":
        result = await jiraClient.issueTypes.getIssueAllTypes();
        break;

      case "list_link_types":
        result = await jiraClient.issueLinkTypes.getIssueLinkTypes();
        break;

      case "get_user": {
        const users = await jiraClient.userSearch.findUsers({
          query: args.email,
          maxResults: 1,
        });
        // Cast users to any[] to handle potential type mismatch from jira.js
        const foundUsers = users as any[];
        if (
          foundUsers.length > 0 &&
          foundUsers[0].emailAddress?.toLowerCase() === args.email.toLowerCase()
        ) {
          result = foundUsers[0]; // Return the full user object, including accountId
        } else {
          // Use InvalidRequest for resource not found type errors
          throw new McpError(
            ErrorCode.InvalidRequest,
            `User with email "${args.email}" not found.`
          );
        }
        break;
      }

      case "create_issue": {
        const {
          projectKey,
          summary,
          issueType,
          description,
          assignee,
          labels,
          components,
          priority,
        } = args;

        // Find project ID
        const project = await jiraClient.projects.getProject({
          projectIdOrKey: projectKey,
        });
        if (!project.id) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Could not find project with key "${projectKey}".`
          );
        }

        // Find issue type ID
        const issueTypes = await jiraClient.issueTypes.getIssueAllTypes();
        const foundType = issueTypes.find(
          (it) => it.name?.toLowerCase() === issueType.toLowerCase()
        );
        if (!foundType || !foundType.id) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Issue type "${issueType}" not found.`
          );
        }

        // Find Priority ID (if provided)
        let priorityId: string | undefined;
        if (priority) {
          try {
            const priorities = await jiraClient.issuePriorities.getPriorities();
            const foundPriority = priorities.find(
              (p) => p.name?.toLowerCase() === priority.toLowerCase()
            );
            if (!foundPriority || !foundPriority.id) {
              console.warn(
                `Priority "${priority}" not found, issue will be created without priority.`
              );
              // Don't throw, just skip setting priority
            } else {
              priorityId = foundPriority.id;
            }
          } catch (e: any) {
            console.warn(
              `Failed to resolve priority ID for "${priority}", issue will be created without priority: ${e.message}`
            );
          }
        }

        // Find Component IDs (if provided)
        let componentObjects: { id: string }[] = []; // Initialize as empty array
        if (components && components.length > 0 && project.id) {
          try {
            const projectComponents =
              await jiraClient.projectComponents.getProjectComponents({
                projectIdOrKey: project.id,
              });
            componentObjects = components
              .map((compName: string) => {
                const foundComp = projectComponents.find(
                  (pc) => pc.name?.toLowerCase() === compName.toLowerCase()
                );
                if (!foundComp || !foundComp.id) {
                  console.warn(
                    `Component "${compName}" not found in project ${projectKey}, skipping.`
                  );
                  return null;
                }
                return { id: foundComp.id };
              })
              .filter(
                (comp: { id: string } | null): comp is { id: string } =>
                  comp !== null
              );
          } catch (e: any) {
            console.warn(
              `Failed to resolve component IDs for project ${projectKey}, issue will be created without components: ${e.message}`
            );
          }
        }

        // Construct fields object step-by-step
        const fields: any = {
          project: { id: project.id },
          summary,
          issuetype: { id: foundType.id },
        };

        // Add optional fields conditionally
        if (description) fields.description = description;
        if (assignee) fields.assignee = { name: assignee };
        if (labels) fields.labels = labels;
        if (componentObjects.length > 0) fields.components = componentObjects;
        if (priorityId) fields.priority = { id: priorityId };

        // Create issue
        result = await jiraClient.issues.createIssue({ fields });
        break;
      }

      case "create_issue_link": {
        await jiraClient.issueLinks.linkIssues({
          type: { name: args.linkType },
          inwardIssue: { key: args.inwardIssueKey },
          outwardIssue: { key: args.outwardIssueKey },
        });
        // Link returns no content on success (201)
        result = {
          success: true,
          message: `Link '${args.linkType}' created between ${args.inwardIssueKey} and ${args.outwardIssueKey}.`,
        };
        break;
      }

      case "get_issue": {
        const { issueKey } = args;
        result = await jiraClient.issues.getIssue({ issueIdOrKey: issueKey });
        break;
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Handler for tool "${name}" not implemented.`
        );
    }

    console.error(`Tool ${name} executed successfully.`);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error: any) {
    console.error(`Error executing tool ${name}:`, error);

    const errorMessage =
      error?.errorMessages?.join(", ") ||
      error?.message ||
      "An unknown error occurred";
    const statusCode = error?.status || 500;

    let mcpErrorCode = ErrorCode.InternalError;
    if (statusCode === 400) {
      mcpErrorCode = ErrorCode.InvalidParams;
    } else if (statusCode === 401 || statusCode === 403) {
      mcpErrorCode = ErrorCode.InvalidRequest;
    } else if (statusCode === 404) {
      mcpErrorCode = ErrorCode.InvalidRequest;
    }

    throw new McpError(
      mcpErrorCode,
      `Jira API Error (${statusCode}): ${errorMessage}`,
      { originalError: error }
    );
  }
});

// Set up error handler
server.onerror = (error: any) => console.error("[MCP Server Error]", error);

// Handle shutdown
process.on("SIGINT", async () => {
  console.error("Shutting down Jira MCP server...");
  await server.close();
  process.exit(0);
});

// Export start function
export async function start() {
  // Load environment variables from .env file
  dotenv.config();

  // --- Jira Configuration ---
  const JIRA_HOST = process.env.JIRA_HOST;
  const JIRA_EMAIL = process.env.JIRA_EMAIL;
  const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

  if (!JIRA_HOST || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    throw new Error(
      "JIRA_HOST, JIRA_EMAIL, and JIRA_API_TOKEN environment variables are required. Please create a .env file with these values."
    );
  }

  // Initialize Jira clients
  try {
    jiraClient = new Version2Client({
      host: JIRA_HOST,
      authentication: {
        personalAccessToken: JIRA_API_TOKEN,
      },
    });

    agileClient = new AgileClient({
      host: JIRA_HOST,
      authentication: {
        personalAccessToken: JIRA_API_TOKEN,
      },
    });
  } catch (error: any) {
    throw new Error(`Failed to initialize Jira client: ${error.message}`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Jira MCP server running and connected via stdio.");
}

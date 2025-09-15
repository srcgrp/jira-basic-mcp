# Jira MCP Server

A Model Context Protocol (MCP) server for interacting with Jira's API. Provides tools for managing issues, projects, and workflows.

## Features

- Create, update, and delete Jira issues
- List issues with JQL filtering
- Manage issue links and relationships
- Get project metadata (fields, issue types, etc.)
- User account lookup

## Installation

1. Clone this repository
2. Install dependencies:
```bash
npm install
``` 

3. Create a `.env` file with your Jira credentials:
```env
# Your Jira instance URL (e.g., https://company.atlassian.net)
JIRA_HOST=your-instance.atlassian.net
# Your Jira account email
JIRA_EMAIL=your-email@example.com
# Personal Access Token generated from Atlassian account settings
JIRA_API_TOKEN=your-api-token
```

## Configuration

### For Cursor

Add to Cursor MCP settings in `~/.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "jira-mcp": {
      "autoApprove": ["get_issues", "get_issue", "create_issue"],
      "disabled": false,
      "timeout": 180,
      "command": "/usr/bin/node",
      "args": [
        "/path/to/jira-cline-mcp/build/index.js"
      ],
      "env": {
        "JIRA_HOST": "your-instance.atlassian.net",
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token",
        "NODE_ENV": "production"
      },
      "transportType": "stdio"
    }
  }
}
```

For more information on generating an API token, read the PAT documentation in Jira.

## Available Tools

### delete_issue
Delete a Jira issue or subtask by issue key.

**Parameters:**
- `issueKey` (string): Key of the issue to delete (e.g., "PROJ-123")

### get_issues
Get all issues and subtasks for a project or rapid view.

**Parameters:**
- `projectKey` (string): Project key (e.g., "PROJ")
- OR `rapidView` (number|string): Rapid view ID
- `jql` (string, optional): JQL query to filter issues

### get_assigned_issues
Get issues assigned to a user, with options to filter by assignment status.

**Parameters:**
- `accountId` (string): The account ID of the user. Use `get_user` to find this.
- `status` (string, optional): Filter by assignment status: `"current"` (default), `"past"`, or `"all"`.
- `additionalJql` (string, optional): Optional JQL to further filter issues (e.g., `project = "PROJ" AND updated > -1d`).

### update_issue
Update fields of an existing Jira issue.

**Parameters:**
- `issueKey` (string): Key of the issue to update
- `summary` (string, optional): New summary/title
- `description` (string, optional): New description
- `assignee` (string, optional): Account ID of new assignee
- `status` (string, optional): New status name
- `priority` (string, optional): New priority name

### create_issue
Create a new Jira issue.

**Parameters:**
- `projectKey` (string): Project key
- `summary` (string): Issue summary/title
- `issueType` (string): Issue type name
- `description` (string, optional): Detailed description
- `assignee` (string, optional): Account ID of assignee
- `labels` (array, optional): Array of labels
- `components` (array, optional): Array of component names
- `priority` (string, optional): Priority name

### create_issue_link
Create a relationship between two Jira issues.

**Parameters:**
- `inwardIssueKey` (string): Key of inward issue
- `outwardIssueKey` (string): Key of outward issue
- `linkType` (string): Name of link type

## Development

Build the project:
```bash
npm run build
```

Run tests:
```bash
npm test
```

Start the server:
```bash
npm start
```

Use the MCP Inspector to test the server:
```bash
npm run inspector
```

## Technical Details

- Uses Model Context Protocol SDK version 1.18.0
- Compatible with Cursor and other MCP-enabled AI assistants
- Built with TypeScript and Node.js

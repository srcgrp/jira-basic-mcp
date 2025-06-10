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
JIRA_HOST=your-instance.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_PASSWORD=your-api-token
```

## Configuration

Add to Cline MCP settings (usually in `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`):
```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": ["/path/to/jira-basic-mcp/build/index.js"],
      "env": {
        "JIRA_HOST": "your-instance.atlassian.net",
        "JIRA_API_TOKEN": "your-api-token"
      }
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
node build/index.js

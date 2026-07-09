export function projectCanvasToolDefinitions(readAnnotations, writeAnnotations) {
  const projectIdentity = {
    projectId: {
      type: 'string',
      description: 'Project id, Project note path, or exact Project title.',
    },
    vaultPath: {
      type: 'string',
      description: 'Optional target vault root. Required when the Project is ambiguous across active vaults.',
    },
  }

  return [
    {
      name: 'read_project_canvas',
      description: 'Read one Project Canvas graph with compact nodes, relationships, viewport, and vault provenance. Use this to inspect graph structure; it does not expand full Note or Paper bodies. Read-only.',
      annotations: readAnnotations,
      inputSchema: {
        type: 'object',
        properties: projectIdentity,
        required: ['projectId'],
      },
    },
    {
      name: 'search_project_canvas',
      description: 'Search Project Canvas node titles, short text, types, and refs. Optionally scope to one Project; results include Project and vault provenance and remain compact. Read-only.',
      annotations: readAnnotations,
      inputSchema: {
        type: 'object',
        properties: {
          ...projectIdentity,
          query: { type: 'string', description: 'Text to find in Canvas node metadata.' },
          limit: { type: 'number', description: 'Maximum results (default 10, max 20).' },
        },
        required: ['query'],
      },
    },
    {
      name: 'read_project_context',
      description: 'Read evidence-oriented context for one Project Canvas: selected node, one-hop relationships, compact Paper metadata, bounded Note snippets, and exact @block evidence with page provenance. It never reads every Paper body. Read-only.',
      annotations: readAnnotations,
      inputSchema: {
        type: 'object',
        properties: {
          ...projectIdentity,
          selectedNodeId: { type: 'string', description: 'Optional selected Canvas node id. Nearby context is one hop.' },
        },
        required: ['projectId'],
      },
    },
    {
      name: 'add_node_to_project_canvas',
      description: 'Add a compact Note, Paper, @block evidence, image, text, task, or group node to one Project Canvas. Creates a missing Canvas and focuses an existing node when the same ref is already present. Writes only to the explicitly selected active vault.',
      annotations: writeAnnotations,
      inputSchema: {
        type: 'object',
        properties: {
          ...projectIdentity,
          node: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['note', 'paper', 'paper_block', 'image', 'text', 'task', 'group'],
              },
              ref: { type: 'string', description: 'Required for Note, Paper, paper_block, and image nodes.' },
              title: { type: 'string', description: 'Optional compact card title.' },
              text: { type: 'string', description: 'Optional compact embedded text.' },
              completed: { type: 'boolean', description: 'Task completion state.' },
            },
            required: ['type'],
          },
        },
        required: ['projectId', 'node'],
      },
    },
  ]
}

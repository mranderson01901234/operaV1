// IPC channel names - shared between main and renderer

export const IPC_CHANNELS = {
  // Agent operations
  AGENT_CREATE: 'agent:create',
  AGENT_DELETE: 'agent:delete',
  AGENT_UPDATE: 'agent:update',
  AGENT_GET_ALL: 'agent:getAll',
  AGENT_GET_BY_ID: 'agent:getById',
  
  // Message operations
  MESSAGE_CREATE: 'message:create',
  MESSAGE_UPDATE: 'message:update',
  MESSAGE_GET_BY_AGENT: 'message:getByAgent',
  MESSAGE_GET_FIRST_USER: 'message:getFirstUser',
  MESSAGE_DELETE: 'message:delete',

  // File operations
  FILE_PROCESS: 'file:process',
  FILE_VALIDATE: 'file:validate',
  
  // Browser operations
  BROWSER_NAVIGATE: 'browser:navigate',
  BROWSER_GO_BACK: 'browser:goBack',
  BROWSER_GO_FORWARD: 'browser:goForward',
  BROWSER_REFRESH: 'browser:refresh',
  BROWSER_GET_STATE: 'browser:getState',
  BROWSER_GET_CONTEXT: 'browser:getContext',
  BROWSER_TEST_CDP: 'browser:testCDP',
  BROWSER_CAPTURE_SCREENSHOT: 'browser:captureScreenshot',
  BROWSER_GET_ACCESSIBILITY_TREE: 'browser:getAccessibilityTree',
  BROWSER_EXECUTE_TOOL: 'browser:executeTool',
  BROWSER_EXECUTE_TOOLS: 'browser:executeTools',
  
  // LLM operations
  LLM_CHAT: 'llm:chat',
  LLM_STREAM: 'llm:stream',
  
  // Local model operations (for cost optimization)
  LOCAL_MODEL_CLASSIFY_SEARCH_INTENT: 'localModel:classifySearchIntent',
  LOCAL_MODEL_EXTRACT_SEARCH_RESULTS: 'localModel:extractSearchResults',
  LOCAL_MODEL_PLAN_SEARCH: 'localModel:planSearch',
  LOCAL_MODEL_CHECK_AVAILABLE: 'localModel:checkAvailable',
  
  // Deep research operations
  RESEARCH_DEEP: 'research:deep',
  RESEARCH_CONFIGURE: 'research:configure',

  // Tab operations
  TAB_CREATE: 'tab:create',
  TAB_CLOSE: 'tab:close',
  TAB_SWITCH: 'tab:switch',
  TAB_UPDATE: 'tab:update',
  TAB_GET_BY_AGENT: 'tab:getByAgent',
  TAB_GET_ACTIVE: 'tab:getActive',
  TAB_REORDER: 'tab:reorder',

  // Tab history operations
  TAB_HISTORY_GET: 'tabHistory:get',
  TAB_HISTORY_CLEAR: 'tabHistory:clear',
  TAB_HISTORY_DELETE: 'tabHistory:delete',

  // Document operations
  DOCUMENT_CREATE: 'document:create',
  DOCUMENT_GET_BY_ID: 'document:getById',
  DOCUMENT_GET_BY_AGENT: 'document:getByAgent',
  DOCUMENT_UPDATE: 'document:update',
  DOCUMENT_DELETE: 'document:delete',
  DOCUMENT_CREATE_TAB: 'document:createTab',
  DOCUMENT_READ_FILE: 'document:readFile',
  DOCUMENT_SAVE_FILE: 'document:saveFile',
  DOCUMENT_EXTRACT_DOC_TEXT: 'document:extractDocText',
  DOCUMENT_CHECK_DEPENDENCIES: 'document:checkDependencies',

  // Document tool operations (LLM-triggered document editing)
  DOCUMENT_TOOL_LIST: 'documentTool:list',
  DOCUMENT_TOOL_READ: 'documentTool:read',
  DOCUMENT_TOOL_CREATE: 'documentTool:create',
  DOCUMENT_TOOL_EDIT: 'documentTool:edit',

  // Document edit confirmation (for destructive operations)
  DOCUMENT_EDIT_APPROVE: 'documentEdit:approve',
  DOCUMENT_EDIT_REJECT: 'documentEdit:reject',
  DOCUMENT_EDIT_GET_PENDING: 'documentEdit:getPending',

  // Document update events (main -> renderer)
  DOCUMENT_UPDATED: 'document:updated',

  // Window controls (already exists)
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
} as const


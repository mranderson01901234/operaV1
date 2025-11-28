import { getDatabase } from './schema'
import type { Agent, Message, ToolCall, Attachment, Tab, TabHistoryEntry, Document } from '../../shared/types'

const db = getDatabase()

// Agent queries
export const agentQueries = {
  create: (agent: Omit<Agent, 'createdAt' | 'updatedAt'>): Agent => {
    const now = Date.now()
    const stmt = db.prepare(`
      INSERT INTO agents (id, name, createdAt, updatedAt, model, provider, systemPrompt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    
    stmt.run(
      agent.id,
      agent.name,
      now,
      now,
      agent.model,
      agent.provider,
      agent.systemPrompt || null
    )
    
    return {
      ...agent,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    }
  },

  getAll: (): Agent[] => {
    const stmt = db.prepare('SELECT * FROM agents ORDER BY updatedAt DESC')
    const rows = stmt.all() as any[]
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      model: row.model,
      provider: row.provider as Agent['provider'],
      systemPrompt: row.systemPrompt || undefined,
    }))
  },

  getById: (id: string): Agent | null => {
    const stmt = db.prepare('SELECT * FROM agents WHERE id = ?')
    const row = stmt.get(id) as any
    
    if (!row) return null
    
    return {
      id: row.id,
      name: row.name,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      model: row.model,
      provider: row.provider as Agent['provider'],
      systemPrompt: row.systemPrompt || undefined,
    }
  },

  update: (id: string, updates: Partial<Pick<Agent, 'name' | 'model' | 'provider' | 'systemPrompt'>>): Agent | null => {
    const updatesList: string[] = []
    const values: any[] = []
    
    if (updates.name !== undefined) {
      updatesList.push('name = ?')
      values.push(updates.name)
    }
    if (updates.model !== undefined) {
      updatesList.push('model = ?')
      values.push(updates.model)
    }
    if (updates.provider !== undefined) {
      updatesList.push('provider = ?')
      values.push(updates.provider)
    }
    if (updates.systemPrompt !== undefined) {
      updatesList.push('systemPrompt = ?')
      values.push(updates.systemPrompt)
    }
    
    if (updatesList.length === 0) {
      return agentQueries.getById(id)
    }
    
    updatesList.push('updatedAt = ?')
    values.push(Date.now())
    values.push(id)
    
    const stmt = db.prepare(`
      UPDATE agents 
      SET ${updatesList.join(', ')}
      WHERE id = ?
    `)
    
    stmt.run(...values)
    return agentQueries.getById(id)
  },

  delete: (id: string): boolean => {
    const stmt = db.prepare('DELETE FROM agents WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  },
}

// Message queries
export const messageQueries = {
  create: (message: Omit<Message, 'createdAt'>): Message => {
    const now = Date.now()
    const stmt = db.prepare(`
      INSERT INTO messages (id, agentId, role, content, attachments, toolCalls, tokenCount, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    
    stmt.run(
      message.id,
      message.agentId,
      message.role,
      message.content,
      message.attachments ? JSON.stringify(message.attachments) : null,
      message.toolCalls ? JSON.stringify(message.toolCalls) : null,
      message.tokenCount || null,
      now
    )
    
    return {
      ...message,
      createdAt: new Date(now),
    }
  },

  getByAgent: (agentId: string): Message[] => {
    const stmt = db.prepare(`
      SELECT * FROM messages 
      WHERE agentId = ? 
      ORDER BY createdAt ASC
    `)
    const rows = stmt.all(agentId) as any[]
    
    return rows.map(row => ({
      id: row.id,
      agentId: row.agentId,
      role: row.role as Message['role'],
      content: row.content,
      attachments: row.attachments ? JSON.parse(row.attachments) as Attachment[] : undefined,
      toolCalls: row.toolCalls ? JSON.parse(row.toolCalls) as ToolCall[] : undefined,
      tokenCount: row.tokenCount || undefined,
      createdAt: new Date(row.createdAt),
    }))
  },

  getFirstUserMessage: (agentId: string): Message | null => {
    const stmt = db.prepare(`
      SELECT * FROM messages 
      WHERE agentId = ? AND role = 'user'
      ORDER BY createdAt ASC
      LIMIT 1
    `)
    const row = stmt.get(agentId) as any
    
    if (!row) return null
    
    return {
      id: row.id,
      agentId: row.agentId,
      role: row.role as Message['role'],
      content: row.content,
      attachments: row.attachments ? JSON.parse(row.attachments) as Attachment[] : undefined,
      toolCalls: row.toolCalls ? JSON.parse(row.toolCalls) as ToolCall[] : undefined,
      tokenCount: row.tokenCount || undefined,
      createdAt: new Date(row.createdAt),
    }
  },

  update: (id: string, updates: { content?: string; toolCalls?: ToolCall[] }): boolean => {
    const stmt = db.prepare(`
      UPDATE messages
      SET content = COALESCE(?, content),
          toolCalls = COALESCE(?, toolCalls)
      WHERE id = ?
    `)
    const result = stmt.run(
      updates.content ?? null,
      updates.toolCalls ? JSON.stringify(updates.toolCalls) : null,
      id
    )
    return result.changes > 0
  },

  delete: (id: string): boolean => {
    const stmt = db.prepare('DELETE FROM messages WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  },

  deleteByAgent: (agentId: string): number => {
    const stmt = db.prepare('DELETE FROM messages WHERE agentId = ?')
    const result = stmt.run(agentId)
    return result.changes
  },
}

// Tab queries
export const tabQueries = {
  create: (tab: Omit<Tab, 'createdAt' | 'updatedAt'>): Tab => {
    // Validate agent exists
    const agentStmt = db.prepare('SELECT id FROM agents WHERE id = ?')
    const agent = agentStmt.get(tab.agentId)
    if (!agent) {
      throw new Error(`Agent ${tab.agentId} does not exist`)
    }

    // Validate documentId if provided
    if (tab.documentId) {
      const docStmt = db.prepare('SELECT id FROM documents WHERE id = ?')
      const doc = docStmt.get(tab.documentId)
      if (!doc) {
        console.warn(`Document ${tab.documentId} does not exist, setting documentId to NULL`)
        tab.documentId = undefined
      }
    }

    const now = Date.now()
    const stmt = db.prepare(`
      INSERT INTO tabs (id, agentId, title, url, favicon, isActive, isPinned, position, type, documentId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      tab.id,
      tab.agentId,
      tab.title,
      tab.url,
      tab.favicon || null,
      tab.isActive ? 1 : 0,
      tab.isPinned ? 1 : 0,
      tab.position,
      tab.type || 'browser',
      tab.documentId || null,
      now,
      now
    )

    return {
      ...tab,
      type: tab.type || 'browser',
      createdAt: new Date(now),
      updatedAt: new Date(now),
    }
  },

  getByAgent: (agentId: string): Tab[] => {
    const stmt = db.prepare(`
      SELECT * FROM tabs
      WHERE agentId = ?
      ORDER BY isPinned DESC, position ASC
    `)
    const rows = stmt.all(agentId) as any[]

    return rows.map(row => ({
      id: row.id,
      agentId: row.agentId,
      title: row.title,
      url: row.url,
      favicon: row.favicon || undefined,
      isActive: row.isActive === 1,
      isPinned: row.isPinned === 1,
      position: row.position,
      type: (row.type || 'browser') as 'browser' | 'document',
      documentId: row.documentId || undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }))
  },

  getById: (id: string): Tab | null => {
    const stmt = db.prepare('SELECT * FROM tabs WHERE id = ?')
    const row = stmt.get(id) as any

    if (!row) return null

    return {
      id: row.id,
      agentId: row.agentId,
      title: row.title,
      url: row.url,
      favicon: row.favicon || undefined,
      isActive: row.isActive === 1,
      isPinned: row.isPinned === 1,
      position: row.position,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  },

  getActiveByAgent: (agentId: string): Tab | null => {
    const stmt = db.prepare('SELECT * FROM tabs WHERE agentId = ? AND isActive = 1 LIMIT 1')
    const row = stmt.get(agentId) as any

    if (!row) return null

    return {
      id: row.id,
      agentId: row.agentId,
      title: row.title,
      url: row.url,
      favicon: row.favicon || undefined,
      isActive: row.isActive === 1,
      isPinned: row.isPinned === 1,
      position: row.position,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  },

  update: (id: string, updates: Partial<Pick<Tab, 'title' | 'url' | 'favicon' | 'isActive' | 'isPinned' | 'position' | 'type' | 'documentId'>>): Tab | null => {
    const updatesList: string[] = []
    const values: any[] = []

    if (updates.title !== undefined) {
      updatesList.push('title = ?')
      values.push(updates.title)
    }
    if (updates.url !== undefined) {
      updatesList.push('url = ?')
      values.push(updates.url)
    }
    if (updates.favicon !== undefined) {
      updatesList.push('favicon = ?')
      values.push(updates.favicon)
    }
    if (updates.isActive !== undefined) {
      updatesList.push('isActive = ?')
      values.push(updates.isActive ? 1 : 0)
    }
    if (updates.isPinned !== undefined) {
      updatesList.push('isPinned = ?')
      values.push(updates.isPinned ? 1 : 0)
    }
    if (updates.position !== undefined) {
      updatesList.push('position = ?')
      values.push(updates.position)
    }
    if (updates.type !== undefined) {
      updatesList.push('type = ?')
      values.push(updates.type)
    }
    if (updates.documentId !== undefined) {
      updatesList.push('documentId = ?')
      values.push(updates.documentId || null)
    }

    if (updatesList.length === 0) {
      return tabQueries.getById(id)
    }

    updatesList.push('updatedAt = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = db.prepare(`
      UPDATE tabs
      SET ${updatesList.join(', ')}
      WHERE id = ?
    `)

    stmt.run(...values)
    return tabQueries.getById(id)
  },

  setActiveTab: (agentId: string, tabId: string): void => {
    // Deactivate all tabs for this agent
    const deactivateStmt = db.prepare('UPDATE tabs SET isActive = 0 WHERE agentId = ?')
    deactivateStmt.run(agentId)

    // Activate the specified tab
    const activateStmt = db.prepare('UPDATE tabs SET isActive = 1, updatedAt = ? WHERE id = ?')
    activateStmt.run(Date.now(), tabId)
  },

  delete: (id: string): boolean => {
    const stmt = db.prepare('DELETE FROM tabs WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  },

  deleteByAgent: (agentId: string): number => {
    const stmt = db.prepare('DELETE FROM tabs WHERE agentId = ?')
    const result = stmt.run(agentId)
    return result.changes
  },

  getNextPosition: (agentId: string): number => {
    const stmt = db.prepare('SELECT MAX(position) as maxPos FROM tabs WHERE agentId = ?')
    const result = stmt.get(agentId) as any
    return (result?.maxPos ?? -1) + 1
  },

  reorder: (tabIds: string[]): void => {
    const stmt = db.prepare('UPDATE tabs SET position = ?, updatedAt = ? WHERE id = ?')
    const now = Date.now()
    tabIds.forEach((id, index) => {
      stmt.run(index, now, id)
    })
  },
}

// Tab history queries
export const tabHistoryQueries = {
  add: (entry: Omit<TabHistoryEntry, 'visitedAt'>): TabHistoryEntry => {
    const now = Date.now()

    // Get current max position for this tab
    const posStmt = db.prepare('SELECT MAX(position) as maxPos FROM tab_history WHERE tabId = ?')
    const posResult = posStmt.get(entry.tabId) as any
    const position = (posResult?.maxPos ?? -1) + 1

    const stmt = db.prepare(`
      INSERT INTO tab_history (id, tabId, url, title, visitedAt, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      entry.id,
      entry.tabId,
      entry.url,
      entry.title,
      now,
      position
    )

    // Enforce 50 entry limit - delete oldest entries
    const deleteStmt = db.prepare(`
      DELETE FROM tab_history
      WHERE tabId = ?
      AND id NOT IN (
        SELECT id FROM tab_history
        WHERE tabId = ?
        ORDER BY visitedAt DESC
        LIMIT 50
      )
    `)
    deleteStmt.run(entry.tabId, entry.tabId)

    return {
      ...entry,
      visitedAt: new Date(now),
      position,
    }
  },

  getByTab: (tabId: string, limit: number = 50): TabHistoryEntry[] => {
    const stmt = db.prepare(`
      SELECT * FROM tab_history
      WHERE tabId = ?
      ORDER BY visitedAt DESC
      LIMIT ?
    `)
    const rows = stmt.all(tabId, limit) as any[]

    return rows.map(row => ({
      id: row.id,
      tabId: row.tabId,
      url: row.url,
      title: row.title,
      visitedAt: new Date(row.visitedAt),
      position: row.position,
    }))
  },

  clearByTab: (tabId: string): number => {
    const stmt = db.prepare('DELETE FROM tab_history WHERE tabId = ?')
    const result = stmt.run(tabId)
    return result.changes
  },

  delete: (id: string): boolean => {
    const stmt = db.prepare('DELETE FROM tab_history WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  },
}

// Document queries
export const documentQueries = {
  create: (document: Omit<Document, 'createdAt' | 'updatedAt'>): Document => {
    const now = Date.now()
    const stmt = db.prepare(`
      INSERT INTO documents (id, agentId, name, filePath, mimeType, fileSize, extractedText, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      document.id,
      document.agentId,
      document.name,
      document.filePath,
      document.mimeType,
      document.fileSize,
      document.extractedText || null,
      now,
      now
    )

    return {
      ...document,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    }
  },

  getById: (id: string): Document | null => {
    const stmt = db.prepare('SELECT * FROM documents WHERE id = ?')
    const row = stmt.get(id) as any

    if (!row) return null

    return {
      id: row.id,
      agentId: row.agentId,
      name: row.name,
      filePath: row.filePath,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      extractedText: row.extractedText || undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  },

  getByAgent: (agentId: string): Document[] => {
    const stmt = db.prepare(`
      SELECT * FROM documents
      WHERE agentId = ?
      ORDER BY updatedAt DESC
    `)
    const rows = stmt.all(agentId) as any[]

    return rows.map(row => ({
      id: row.id,
      agentId: row.agentId,
      name: row.name,
      filePath: row.filePath,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      extractedText: row.extractedText || undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }))
  },

  update: (
    id: string,
    updates: Partial<Pick<Document, 'name' | 'extractedText'>>
  ): Document | null => {
    const updatesList: string[] = []
    const values: any[] = []

    if (updates.name !== undefined) {
      updatesList.push('name = ?')
      values.push(updates.name)
    }
    if (updates.extractedText !== undefined) {
      updatesList.push('extractedText = ?')
      values.push(updates.extractedText || null)
    }

    if (updatesList.length === 0) {
      return documentQueries.getById(id)
    }

    updatesList.push('updatedAt = ?')
    values.push(Date.now())
    values.push(id)

    const stmt = db.prepare(`
      UPDATE documents
      SET ${updatesList.join(', ')}
      WHERE id = ?
    `)

    stmt.run(...values)
    return documentQueries.getById(id)
  },

  updateExtractedText: (id: string, extractedText: string): boolean => {
    const stmt = db.prepare(`
      UPDATE documents
      SET extractedText = ?, updatedAt = ?
      WHERE id = ?
    `)
    const result = stmt.run(extractedText, Date.now(), id)
    return result.changes > 0
  },

  delete: (id: string): boolean => {
    const stmt = db.prepare('DELETE FROM documents WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  },

  deleteByAgent: (agentId: string): number => {
    const stmt = db.prepare('DELETE FROM documents WHERE agentId = ?')
    const result = stmt.run(agentId)
    return result.changes
  },
}


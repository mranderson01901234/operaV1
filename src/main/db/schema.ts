import { app } from 'electron'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
// Use require for native module
const Database = require('better-sqlite3')

let db: any = null

export function getDatabase() {
  if (db) {
    return db
  }

  // Use userData directory for production, or local for dev
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'app.db')
  
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL') // Better concurrency
  db.pragma('foreign_keys = ON') // Enable foreign key constraints
  
  initializeSchema(db)
  
  return db
}

function initializeSchema(database: Database.Database) {
  // Agents table
  database.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      model TEXT NOT NULL,
      provider TEXT NOT NULL,
      systemPrompt TEXT
    )
  `)

  // Messages table
  database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      agentId TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT NOT NULL,
      attachments TEXT, -- JSON string
      toolCalls TEXT,   -- JSON string
      tokenCount INTEGER,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
    )
  `)

  // Create indexes for better query performance
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_agentId ON messages(agentId);
    CREATE INDEX IF NOT EXISTS idx_messages_createdAt ON messages(createdAt);
    CREATE INDEX IF NOT EXISTS idx_agents_updatedAt ON agents(updatedAt);
  `)

  // Tabs table - stores browser tabs per agent
  database.exec(`
    CREATE TABLE IF NOT EXISTS tabs (
      id TEXT PRIMARY KEY,
      agentId TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'New Tab',
      url TEXT NOT NULL DEFAULT 'about:blank',
      favicon TEXT,
      isActive INTEGER NOT NULL DEFAULT 0,
      isPinned INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
    )
  `)

  // Tab history table - stores navigation history per tab (limited to 50 entries)
  database.exec(`
    CREATE TABLE IF NOT EXISTS tab_history (
      id TEXT PRIMARY KEY,
      tabId TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      visitedAt INTEGER NOT NULL,
      position INTEGER NOT NULL,
      FOREIGN KEY (tabId) REFERENCES tabs(id) ON DELETE CASCADE
    )
  `)

  // Create indexes for tab tables
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_tabs_agentId ON tabs(agentId);
    CREATE INDEX IF NOT EXISTS idx_tabs_position ON tabs(agentId, position);
    CREATE INDEX IF NOT EXISTS idx_tab_history_tabId ON tab_history(tabId);
    CREATE INDEX IF NOT EXISTS idx_tab_history_visitedAt ON tab_history(tabId, visitedAt);
  `)

  // Documents table - stores persistent documents per agent
  database.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      agentId TEXT NOT NULL,
      name TEXT NOT NULL,
      filePath TEXT NOT NULL,
      mimeType TEXT NOT NULL,
      fileSize INTEGER NOT NULL,
      extractedText TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
    )
  `)

  // Create indexes for documents table
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_documents_agentId ON documents(agentId);
    CREATE INDEX IF NOT EXISTS idx_documents_updatedAt ON documents(updatedAt);
  `)

  // Migrate tabs table to support document tabs
  // Add type column if it doesn't exist (default 'browser' for backward compatibility)
  try {
    database.exec(`ALTER TABLE tabs ADD COLUMN type TEXT DEFAULT 'browser'`)
  } catch (error: any) {
    // Column already exists, ignore error
    if (!error.message?.includes('duplicate column')) {
      console.warn('Error adding type column to tabs:', error)
    }
  }

  // Add documentId column if it doesn't exist
  try {
    database.exec(`ALTER TABLE tabs ADD COLUMN documentId TEXT`)
  } catch (error: any) {
    // Column already exists, ignore error
    if (!error.message?.includes('duplicate column')) {
      console.warn('Error adding documentId column to tabs:', error)
    }
  }

  // Update existing tabs to have type = 'browser' if null
  database.exec(`UPDATE tabs SET type = 'browser' WHERE type IS NULL`)

  // Note: SQLite doesn't support adding FOREIGN KEY constraints via ALTER TABLE
  // We'll handle referential integrity in application code
  // Clean up any orphaned documentId references
  database.exec(`
    UPDATE tabs 
    SET documentId = NULL 
    WHERE documentId IS NOT NULL 
    AND documentId NOT IN (SELECT id FROM documents)
  `)
}

export function closeDatabase() {
  if (db) {
    db.close()
    db = null
  }
}


/**
 * File Manager Service
 * 
 * Handles document file storage and retrieval from the filesystem.
 * Documents are stored in: userData/documents/{agentId}/{documentId}/{filename}
 */

import { app } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'

const DOCUMENTS_DIR = 'documents'

/**
 * Get the base documents directory path
 */
function getDocumentsBasePath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, DOCUMENTS_DIR)
}

/**
 * Get the directory path for an agent's documents
 */
function getAgentDocumentsPath(agentId: string): string {
  return path.join(getDocumentsBasePath(), agentId)
}

/**
 * Get the directory path for a specific document
 */
function getDocumentPath(agentId: string, documentId: string): string {
  return path.join(getAgentDocumentsPath(agentId), documentId)
}

/**
 * Ensure the documents directory structure exists
 */
async function ensureDocumentsDirectory(agentId: string, documentId: string): Promise<string> {
  const docPath = getDocumentPath(agentId, documentId)
  await fs.mkdir(docPath, { recursive: true })
  return docPath
}

/**
 * Save a document file to the filesystem
 * Returns the relative file path
 */
export async function saveDocument(
  agentId: string,
  documentId: string,
  filename: string,
  buffer: Buffer
): Promise<string> {
  // Ensure directory exists
  const docDir = await ensureDocumentsDirectory(agentId, documentId)
  
  // Sanitize filename to prevent path traversal
  const sanitizedFilename = path.basename(filename)
  const filePath = path.join(docDir, sanitizedFilename)
  
  // Write file
  await fs.writeFile(filePath, buffer)
  
  // Return relative path from documents base directory
  const relativePath = path.relative(getDocumentsBasePath(), filePath)
  return relativePath.replace(/\\/g, '/') // Normalize path separators
}

/**
 * Read a document file from the filesystem
 */
export async function readDocument(filePath: string): Promise<Buffer> {
  // Resolve relative path to absolute
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(getDocumentsBasePath(), filePath)
  
  // Security check: ensure path is within documents directory
  const resolvedPath = path.resolve(absolutePath)
  const basePath = path.resolve(getDocumentsBasePath())
  
  if (!resolvedPath.startsWith(basePath)) {
    throw new Error('Invalid document path: path traversal detected')
  }
  
  return fs.readFile(resolvedPath)
}

/**
 * Delete a document directory and all its contents
 */
export async function deleteDocument(agentId: string, documentId: string): Promise<void> {
  const docPath = getDocumentPath(agentId, documentId)
  
  try {
    // Check if directory exists
    const stats = await fs.stat(docPath)
    if (stats.isDirectory()) {
      // Remove directory and all contents
      await fs.rm(docPath, { recursive: true, force: true })
    }
  } catch (error: any) {
    // Ignore if directory doesn't exist
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
}

/**
 * Get the absolute file path for a document
 */
export function getDocumentFilePath(filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath
  }
  return path.join(getDocumentsBasePath(), filePath)
}

/**
 * Check if a document file exists
 */
export async function documentExists(filePath: string): Promise<boolean> {
  try {
    const absolutePath = getDocumentFilePath(filePath)
    await fs.access(absolutePath)
    return true
  } catch {
    return false
  }
}

/**
 * Get file size of a document
 */
export async function getDocumentSize(filePath: string): Promise<number> {
  const absolutePath = getDocumentFilePath(filePath)
  const stats = await fs.stat(absolutePath)
  return stats.size
}


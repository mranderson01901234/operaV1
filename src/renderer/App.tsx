import React, { useEffect } from 'react'
import TitleBar from './components/Layout/TitleBar'
import SplitView from './components/Layout/SplitView'
import Sidebar from './components/Sidebar/Sidebar'
import ChatPanel from './components/Chat/ChatPanel'
import BrowserPanel from './components/Browser/BrowserPanel'
import DocumentPanel from './components/Document/DocumentPanel'
import { useTabStore } from './stores/tabStore'

function App() {
  // Debug: Log that React is rendering
  console.log('✅ React App component rendering...')
  
  const { getActiveTabType } = useTabStore()
  const activeTabType = getActiveTabType()
  const isDocumentTab = activeTabType === 'document'
  
  // Handle window resize to ensure proper layout updates
  // Note: React will automatically re-render on window resize, so we don't need to dispatch events
  // If BrowserView bounds need updating, that should be handled in the BrowserView component itself
  useEffect(() => {
    // This effect can be used for any resize-related side effects if needed
    // Currently, React's natural re-rendering on resize is sufficient
  }, [])
  
  try {
    return (
      <div className="w-full h-full bg-dark-bg flex flex-col min-w-0 min-h-0" style={{ position: 'relative', zIndex: 1 }}>
        <TitleBar />
        <div className="flex-1 overflow-hidden min-w-0 min-h-0" style={{ position: 'relative', zIndex: 1 }}>
          <SplitView sidebar={<Sidebar />}>
            <ChatPanel />
            {isDocumentTab ? <DocumentPanel /> : <BrowserPanel />}
          </SplitView>
        </div>
      </div>
    )
  } catch (error) {
    console.error('❌ Error in App component:', error)
    return (
      <div style={{ padding: '20px', color: 'red', backgroundColor: '#1a1a1a' }}>
        <h1>App Component Error</h1>
        <pre>{error instanceof Error ? error.stack : String(error)}</pre>
      </div>
    )
  }
}

export default App


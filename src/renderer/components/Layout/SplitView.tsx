import React from 'react'
import UnifiedTabBar from '../Browser/UnifiedTabBar'

interface SplitViewProps {
  sidebar: React.ReactNode
  children: React.ReactNode[]
}

const SplitView: React.FC<SplitViewProps> = ({ sidebar, children }) => {
  return (
    <div className="flex w-full h-full min-w-0">
      {/* Sidebar - responsive width: 240px on large screens, smaller on mobile */}
      <div className="w-60 min-w-[200px] max-w-[300px] h-full flex-shrink-0 overflow-hidden">
        {sidebar}
      </div>
      {/* Split view - flexible layout that adapts to screen size */}
      <div className="flex-1 flex h-full min-w-0 overflow-hidden">
        {/* Left panel - Chat */}
        <div className="w-1/2 min-w-[300px] h-full flex-shrink-0 overflow-hidden">
          {children[0]}
        </div>
        {/* Right panel - Browser/Document with unified tab bar */}
        <div className="w-1/2 min-w-[300px] h-full flex-shrink-0 flex flex-col overflow-hidden">
          {/* Unified Tab Bar - always visible */}
          <UnifiedTabBar />
          {/* Content area */}
          <div className="flex-1 overflow-hidden min-w-0">
            {children[1]}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SplitView


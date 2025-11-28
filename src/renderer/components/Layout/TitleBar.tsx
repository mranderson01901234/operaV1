import React from 'react'

declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void
      maximize: () => void
      close: () => void
    }
  }
}

const TitleBar: React.FC = () => {
  const handleMinimize = () => {
    window.electronAPI?.minimize()
  }

  const handleMaximize = () => {
    window.electronAPI?.maximize()
  }

  const handleClose = () => {
    window.electronAPI?.close()
  }

  return (
    <div 
      className="h-8 bg-dark-panel border-b border-dark-border flex items-center justify-between px-4 drag-region"
      style={{
        WebkitAppRegion: 'drag',
        appRegion: 'drag',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm text-dark-text-secondary font-medium">Opera Studio</span>
      </div>
      
      <div className="flex items-center gap-1 no-drag-region" style={{ WebkitAppRegion: 'no-drag', appRegion: 'no-drag' }}>
        <button
          onClick={handleMinimize}
          className="w-8 h-8 flex items-center justify-center hover:bg-dark-bg transition-colors text-dark-text-secondary hover:text-dark-text"
          title="Minimize"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="w-8 h-8 flex items-center justify-center hover:bg-dark-bg transition-colors text-dark-text-secondary hover:text-dark-text"
          title="Maximize"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center hover:bg-red-600 transition-colors text-dark-text-secondary hover:text-white"
          title="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default TitleBar






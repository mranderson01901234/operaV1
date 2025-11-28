import React from 'react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

const SearchBar: React.FC<SearchBarProps> = ({ value, onChange }) => {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search operabrowser"
        className="w-full px-3 py-2 pl-9 bg-dark-bg border border-dark-border rounded text-dark-text placeholder-dark-text-secondary text-sm focus:outline-none focus:border-dark-text-secondary transition-colors"
      />
      <svg
        className="absolute left-2.5 top-2.5 w-4 h-4 text-dark-text-secondary"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </div>
  )
}

export default SearchBar






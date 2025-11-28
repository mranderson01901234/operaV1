import React from 'react'

interface Source {
    url: string
    title?: string
    domain?: string
}

interface ResearchResponseProps {
    content: string
    sources?: Source[]
}

// Extract domain from URL for shortening
const getDomainName = (url: string): string => {
    try {
        const urlObj = new URL(url)
        const hostname = urlObj.hostname
        // Remove 'www.' prefix
        return hostname.replace(/^www\./, '')
    } catch {
        return url
    }
}

// External link icon component
const ExternalLinkIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
)

// Parse markdown with support for headers, bold, lists, and citations
const parseResearchMarkdown = (text: string): React.ReactNode[] => {
    const lines = text.split('\n')
    const elements: React.ReactNode[] = []
    let key = 0
    let inList = false
    let listItems: React.ReactNode[] = []

    const flushList = () => {
        if (inList && listItems.length > 0) {
            elements.push(
                <ul key={key++} className="list-disc list-inside space-y-2 my-4 ml-4">
                    {listItems}
                </ul>
            )
            listItems = []
            inList = false
        }
    }

    const parseLine = (line: string): React.ReactNode => {
        let lineKey = 0

        // Parse bold text (**text**)
        const boldRegex = /\*\*(.*?)\*\*/g
        const parts: React.ReactNode[] = []
        let lastIndex = 0
        let match

        while ((match = boldRegex.exec(line)) !== null) {
            if (match.index > lastIndex) {
                parts.push(<span key={lineKey++}>{line.substring(lastIndex, match.index)}</span>)
            }
            parts.push(
                <strong key={lineKey++} className="text-white font-semibold">
                    {match[1]}
                </strong>
            )
            lastIndex = boldRegex.lastIndex
        }

        if (lastIndex < line.length) {
            parts.push(<span key={lineKey++}>{line.substring(lastIndex)}</span>)
        }

        // Parse citations [1], [2], etc.
        const citationRegex = /\[(\d+)\]/g
        const finalParts: React.ReactNode[] = []
        let citationKey = 0

        parts.forEach((part, idx) => {
            if (typeof part === 'string') {
                const citationParts: React.ReactNode[] = []
                let citationLastIndex = 0
                let citationMatch

                while ((citationMatch = citationRegex.exec(part)) !== null) {
                    if (citationMatch.index > citationLastIndex) {
                        citationParts.push(
                            <span key={`${idx}-${citationKey++}`}>
                                {part.substring(citationLastIndex, citationMatch.index)}
                            </span>
                        )
                    }
                    citationParts.push(
                        <sup key={`${idx}-${citationKey++}`} className="text-blue-400 font-medium">
                            [{citationMatch[1]}]
                        </sup>
                    )
                    citationLastIndex = citationRegex.lastIndex
                }

                if (citationLastIndex < part.length) {
                    citationParts.push(
                        <span key={`${idx}-${citationKey++}`}>{part.substring(citationLastIndex)}</span>
                    )
                }

                finalParts.push(...(citationParts.length > 0 ? citationParts : [part]))
            } else {
                finalParts.push(part)
            }
        })

        return <>{finalParts}</>
    }

    lines.forEach((line) => {
        const trimmed = line.trim()

        // H2 headers (##)
        if (trimmed.startsWith('## ')) {
            flushList()
            const headerText = trimmed.substring(3)
            elements.push(
                <h2 key={key++} className="text-2xl font-bold text-white mt-8 mb-4 pb-2 border-b border-gray-700">
                    {parseLine(headerText)}
                </h2>
            )
        }
        // H3 headers (###)
        else if (trimmed.startsWith('### ')) {
            flushList()
            const headerText = trimmed.substring(4)
            elements.push(
                <h3 key={key++} className="text-xl font-semibold text-white mt-6 mb-3">
                    {parseLine(headerText)}
                </h3>
            )
        }
        // Bullet points (- or *)
        else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const itemText = trimmed.substring(2)
            inList = true
            listItems.push(
                <li key={key++} className="text-gray-300 leading-relaxed">
                    {parseLine(itemText)}
                </li>
            )
        }
        // Regular paragraphs
        else if (trimmed.length > 0) {
            flushList()
            elements.push(
                <p key={key++} className="text-gray-300 leading-relaxed my-3">
                    {parseLine(trimmed)}
                </p>
            )
        }
        // Empty lines
        else {
            flushList()
        }
    })

    flushList()
    return elements
}

const ResearchResponse: React.FC<ResearchResponseProps> = ({ content, sources = [] }) => {
    // Split content and sources if they're combined
    let mainContent = content
    let extractedSources = sources

    // Check if sources are embedded in content (legacy format)
    const sourcesMatch = content.match(/---\s*\*\*Sources:\*\*\s*([\s\S]*?)$/m)
    if (sourcesMatch) {
        mainContent = content.substring(0, sourcesMatch.index).trim()
        // Parse embedded sources if needed
    }

    return (
        <div className="w-full max-w-3xl">
            {/* Main content with parsed markdown */}
            <div className="prose prose-invert max-w-none">
                {parseResearchMarkdown(mainContent)}
            </div>

            {/* Sources section */}
            {extractedSources.length > 0 && (
                <div className="mt-8 pt-6 border-t border-gray-700">
                    <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Sources
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {extractedSources.map((source, index) => {
                            const domain = getDomainName(source.url)
                            return (
                                <a
                                    key={index}
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-gray-600 transition-all group"
                                >
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 font-semibold">
                                        {index + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-white truncate group-hover:text-blue-400 transition-colors">
                                            {source.title || domain}
                                        </div>
                                        <div className="text-xs text-gray-500 truncate">{domain}</div>
                                    </div>
                                    <ExternalLinkIcon className="w-4 h-4 text-gray-500 group-hover:text-blue-400 transition-colors flex-shrink-0" />
                                </a>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}

export default ResearchResponse

// Application constants

export const APP_NAME = 'Universal Assistant'

export const DEFAULT_MODEL = 'gpt-4o'
export const DEFAULT_PROVIDER = 'openai' as const

export const DEFAULT_BROWSER_URL = 'https://www.google.com'

export const DATABASE_PATH = 'app.db' // Will be in userData directory

export const BROWSER_AGENT_PROMPT = `Browser automation assistant. Control web browser via tools.

Context provided:
- Current URL and page title
- Accessibility tree (interactive elements with selectors)
- Optional screenshot (request via screenshot tool)

Tools:
- navigate: Go to URL
- click: Click element by selector
- type: Type into input field
- scroll: Scroll page (direction: up/down/left/right)
- extract: Extract text/attribute from element
- screenshot: Capture page screenshot (use when visual context needed)
- wait: Wait for element to appear
- summarize: Summarize page content (brief/medium/detailed)
- extractKeyPoints: Extract key points as bullet list
- summarizeSection: Summarize a specific section by name

Use accessibility tree to find selectors. Only request screenshot when visual context needed.
For content understanding, use summarize/extractKeyPoints tools instead of reading everything.`


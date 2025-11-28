<p align="center">
  <img src="cube.png" alt="Opera Studio" width="120" height="120">
</p>

<h1 align="center">Opera Studio</h1>

<p align="center">
  <strong>AI-Powered Research & Productivity Desktop Application</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#screenshots">Screenshots</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue" alt="Platform">
  <img src="https://img.shields.io/badge/Electron-Latest-47848F?logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript" alt="TypeScript">
</p>

---

## Overview

Opera Studio is a next-generation desktop application that combines intelligent AI assistance with powerful browser automation and document processing capabilities. Built for researchers, analysts, and knowledge workers who need to gather, synthesize, and act on information efficiently.

## Features

### Deep Research Engine
- **Multi-phase research pipeline** - Automatically decomposes complex queries, searches multiple sources in parallel, and synthesizes findings with citations
- **Source verification** - Cross-references facts across sources with confidence scoring
- **Gap analysis** - Identifies missing information and suggests follow-up searches
- **Citation tracking** - All findings linked to original sources

### Intelligent Browser
- **AI-guided navigation** - Natural language commands to browse, click, extract, and interact with web pages
- **Smart content extraction** - Automatically identifies and extracts relevant content from pages
- **Multi-tab research** - Parallel page fetching for faster research workflows
- **Search integration** - Works with Google, Bing, DuckDuckGo, and other search engines

### Document Processing
- **Multi-format support** - PDF, Word, Excel, PowerPoint, Markdown, and code files
- **Intelligent analysis** - AI-powered document summarization and key point extraction
- **Large file handling** - Optimized chunking for processing large spreadsheets and documents
- **In-app editing** - View and edit documents without leaving the application

### Multi-LLM Support
- **Provider flexibility** - Choose from OpenAI, Anthropic Claude, Google Gemini, or DeepSeek
- **Automatic optimization** - Smart routing to the most cost-effective model for each task
- **Vision capabilities** - Screenshot analysis and visual understanding (supported models)

### Media Integration
- **Spotify Connect** - Control your music without leaving the app
- **Persistent sessions** - Stay logged in across app restarts

### User Experience
- **Split-view interface** - Chat and browser side-by-side for seamless workflows
- **Dark theme** - Modern, eye-friendly design
- **Cross-platform** - Windows, macOS, and Linux support

## Screenshots

<p align="center">
  <em>Screenshots coming soon</em>
</p>

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- API keys for your preferred LLM provider(s)

### Installation

```bash
# Clone the repository
git clone https://github.com/mranderson01901234/operaV1.git
cd operaV1

# Install dependencies
npm install

# Start development server
npm run dev
```

### Configuration

1. Launch the application
2. Open Settings (gear icon)
3. Add your API keys for the LLM providers you want to use:
   - OpenAI
   - Anthropic
   - Google Gemini
   - DeepSeek (optional, for cost optimization)

### Build

```bash
# Build for your current platform
npm run build

# Build distributable
npm run build:dist
```

## Technology Stack

| Layer | Technologies |
|-------|--------------|
| Desktop Framework | Electron |
| Frontend | React, TypeScript, Tailwind CSS |
| State Management | Zustand |
| Browser Engine | Chromium (via Electron) |
| Database | SQLite (better-sqlite3) |
| Build Tool | electron-vite |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Opera Studio                          │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │   Chat Panel    │    │      Browser Panel          │ │
│  │                 │    │                             │ │
│  │  • Messages     │    │  • Tab Management           │ │
│  │  • Research     │    │  • Content Extraction       │ │
│  │  • Documents    │    │  • AI Navigation            │ │
│  │                 │    │                             │ │
│  └─────────────────┘    └─────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│                    Core Services                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │ Research │ │   LLM    │ │ Document │ │   Media    │ │
│  │  Engine  │ │  Router  │ │ Processor│ │ Integration│ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Roadmap

- [ ] Plugin system for extensibility
- [ ] Team collaboration features
- [ ] Local LLM support (Ollama)
- [ ] Advanced workflow automation
- [ ] Knowledge base with vector search

## Contributing

This project is currently in private development. If you're interested in contributing or licensing, please reach out.

## License

**Proprietary Software** - All Rights Reserved

This software is proprietary and confidential. Unauthorized copying, distribution, modification, or use of this software, via any medium, is strictly prohibited without express written permission from the author.

For licensing inquiries, please contact: [Your Contact Information]

---

<p align="center">
  Built with passion for productivity
</p>

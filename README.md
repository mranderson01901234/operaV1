# OperaBrowser - Universal Assistant

A desktop application with a persistent 50/50 split interface: AI chat on the left, integrated browser on the right.

## Features

- **50/50 Split Layout**: Chat panel on the left, browser panel on the right
- **Animated Cube**: Semi-transparent animated cube icon in the center of empty chat area
- **Sticky Input**: User input box stays at the bottom of the chat panel
- **Dark Theme**: Modern dark UI matching the reference design

## Getting Started

### Install Dependencies

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

## Project Structure

```
operabrowser/
├── src/
│   ├── main/              # Electron main process
│   ├── preload/           # Preload scripts
│   └── renderer/          # React frontend
│       ├── components/
│       │   ├── Chat/      # Chat panel components
│       │   ├── Browser/   # Browser panel components
│       │   └── Layout/    # Layout components
│       └── App.tsx        # Root component
├── blueprint              # Architecture blueprint
└── package.json
```

## Key Components

- **ChatPanel**: Main chat interface with sticky input and animated cube for empty state
- **AnimatedCube**: 3D rotating cube animation using Canvas API
- **BrowserPanel**: Browser interface with URL bar and empty state
- **SplitView**: 50/50 split layout component






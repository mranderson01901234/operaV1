# Troubleshooting: Local Model Not Available

If you see the message `[Local Model] Not available (model: llama3.2:3b)`, follow these steps to fix it.

## Quick Diagnosis

Run these commands to diagnose the issue:

```bash
# 1. Check if Ollama is installed
which ollama

# 2. Check if Ollama service is running
curl http://localhost:11434/api/tags

# 3. Check available models
ollama list

# 4. Check if the specific model is installed
ollama list | grep llama3.2
```

## Common Issues and Solutions

### Issue 1: Ollama Not Installed

**Symptoms:**
- `which ollama` returns nothing
- `curl http://localhost:11434/api/tags` fails

**Solution:**

**macOS/Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Windows:**
1. Download installer from: https://ollama.com/download
2. Run the installer
3. Restart your terminal/command prompt

**Verify:**
```bash
ollama --version
```

---

### Issue 2: Ollama Not Running

**Symptoms:**
- `curl http://localhost:11434/api/tags` fails with connection error
- `ollama list` works but service isn't accessible

**Solution:**

**Check if Ollama service is running:**
```bash
# macOS/Linux
ps aux | grep ollama

# Windows
tasklist | findstr ollama
```

**Start Ollama:**

**Option A: Run as service (recommended)**
- On macOS/Linux, Ollama usually runs as a service automatically
- On Windows, check if Ollama service is running in Services

**Option B: Run manually**
```bash
ollama serve
```

Keep this terminal open while using the application.

**Verify:**
```bash
curl http://localhost:11434/api/tags
```

Should return JSON with available models.

---

### Issue 3: Model Not Pulled

**Symptoms:**
- `ollama list` doesn't show `llama3.2:3b`
- Application says model not found

**Solution:**

Pull the model:
```bash
ollama pull llama3.2:3b
```

This will download ~2GB. Wait for it to complete.

**Verify:**
```bash
ollama list
```

Should show `llama3.2:3b` in the list.

---

### Issue 4: Model Name Mismatch

**Symptoms:**
- Model exists but with different name (e.g., `llama3.2` instead of `llama3.2:3b`)

**Solution:**

**Option A: Use the correct model name**
Check what models you have:
```bash
ollama list
```

Then update the configuration in `src/main/llm/local-model.ts`:
```typescript
private model: string = 'llama3.2' // Use the actual name
```

**Option B: Pull the exact model**
```bash
ollama pull llama3.2:3b
```

---

### Issue 5: Port Conflict

**Symptoms:**
- Ollama is running but on different port
- Connection refused errors

**Solution:**

**Check what port Ollama is using:**
```bash
# macOS/Linux
lsof -i :11434

# Windows
netstat -ano | findstr :11434
```

**Update configuration** in `src/main/llm/local-model.ts`:
```typescript
private host: string = 'http://localhost:11434' // Change port if needed
```

---

### Issue 6: Firewall/Network Issues

**Symptoms:**
- Connection timeout errors
- Works in terminal but not in application

**Solution:**

**Check firewall settings:**
- Allow Ollama through firewall
- Check if localhost connections are blocked

**Test connection:**
```bash
curl -v http://localhost:11434/api/tags
```

Should show successful connection.

---

## Step-by-Step Setup (Fresh Install)

If starting from scratch, follow these steps:

### 1. Install Ollama

**macOS/Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Windows:**
- Download from https://ollama.com/download
- Run installer

### 2. Verify Installation

```bash
ollama --version
```

Should show version number.

### 3. Pull the Model

```bash
ollama pull llama3.2:3b
```

Wait for download to complete (~2GB).

### 4. Verify Model

```bash
ollama list
```

Should show `llama3.2:3b` in the list.

### 5. Test Ollama Service

```bash
ollama run ollama run llama3.2:3b "Hello,"
```

Should return a response from the model.

### 6. Restart Application

Restart your Electron application.

You should now see:
```
[Local Model] ✅ Available (model: llama3.2:3.2:3b)
```

What's wrong with this file? Let me check this file?`)
import { A11y-title.tsx'
import { ipc-title.tsx'
import { ipc-title from './a-title.tsx'
import { ipc-title.tsx-axis-title.tsx'
import { ipc-title.tsx-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx-axis-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import {title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { title.tsx'
import { ipc-title.tsx'
import { title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { title.tsx'
import title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx'
import { ipc-title.tsx

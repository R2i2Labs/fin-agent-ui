const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const { spawn } = require('child_process');
const axios = require('axios'); // For checking if FastAPI server is ready

const isDev = !app.isPackaged;

const basePath = isDev
  ? path.resolve(__dirname, '..') // dev
  : path.join(process.resourcesPath, 'backend'); // packaged

const apiScriptPath = path.join(basePath, 'api.py');
let pythonExecutable = path.join(basePath, 'myenv', 'bin', 'python');

if (!fs.existsSync(pythonExecutable)) {
  pythonExecutable = '/usr/bin/python3'; // fallback
}

console.log('✅ Launching FastAPI server...');
console.log('📍 Script:', apiScriptPath);
console.log('🐍 Python:', pythonExecutable);

// Function to check if the FastAPI server is up and running
async function waitForFastAPIReady(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      // Make a GET request to check server health
      const res = await axios.get('http://127.0.0.1:8000/status');
      if (res.data.status === 'ok') {
        console.log('✅ FastAPI server is up!');
        return true;
      }
    } catch (e) {
      // Wait for 1 second before retrying
      console.log(`⏳ Waiting for FastAPI to start... Attempt ${i + 1}/${retries}`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  console.error('❌ FastAPI server did not start in time.');
  return false;
}

// Start the Python FastAPI server and wait for it to be ready
const pythonProcess = spawn(pythonExecutable, [apiScriptPath], {
  cwd: basePath,
});

pythonProcess.stdout.on('data', (data) => {
  console.log(`🟢 FastAPI STDOUT: ${data}`);
});

pythonProcess.stderr.on('data', (data) => {
  console.error(`🔴 FastAPI STDERR: ${data}`);
});

pythonProcess.on('close', (code) => {
  console.log(`⚠️ FastAPI exited with code ${code}`);
});

pythonProcess.on('error', (err) => {
  console.error(`❌ Failed to start FastAPI server: ${err.message}`);
});

// Register protocol for serving files
function registerFileProtocol() {
  protocol.registerFileProtocol('file', (request, callback) => {
    const filePath = url.fileURLToPath(request.url);
    callback({ path: filePath });
  });
}

// Function to create the Electron window after FastAPI is ready
async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'), // Preload script
    },
  });

  // Set content security policy with updated connect-src to allow localhost:8000
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:8000"
        ]
      }
    });
  });

  // Load the static Next.js site from ../out/index.html
  const indexPath = path.join(__dirname, '..', 'out', 'index.html');
  
  // Check if the index.html file exists
  if (fs.existsSync(indexPath)) {
    console.log('Index file found at:', indexPath);
    win.loadFile(indexPath);
  } else {
    console.error('Index file not found at:', indexPath);
    win.loadFile(path.join(__dirname, 'error.html'));
  }

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  // Start the FastAPI server
  const serverStarted = await waitForFastAPIReady(); // Wait for FastAPI to be ready

  if (serverStarted) {
    registerFileProtocol();
    createWindow();
  } else {
    console.error('❌ Could not start the application because FastAPI is not ready.');
    app.quit();
  }
});

// macOS specific behavior
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

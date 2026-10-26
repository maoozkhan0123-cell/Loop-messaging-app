const { app, BrowserWindow, Menu, shell, session } = require('electron')
const path = require('path')

const APP_URL = process.env.BYSYNC_APP_URL || process.env.LOOP_APP_URL || 'https://loop-messaging-app-silk.vercel.app'
const APP_ORIGIN = new URL(APP_URL).origin

let mainWindow = null

function isTrustedUrl(rawUrl) {
  try {
    return new URL(rawUrl).origin === APP_ORIGIN
  } catch {
    return false
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'BySync',
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#F4F8FC',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedUrl(url)) return { action: 'allow' }
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isTrustedUrl(url)) return
    event.preventDefault()
    void shell.openExternal(url)
  })

  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault())

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') mainWindow?.reload()
  })

  void mainWindow.loadURL(APP_URL)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.bytechsol.bysync')

    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      const trusted = isTrustedUrl(webContents.getURL())
      callback(trusted && ['notifications', 'clipboard-sanitized-write'].includes(permission))
    })

    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
      const trusted = !!webContents && isTrustedUrl(webContents.getURL())
      return trusted && ['notifications', 'clipboard-sanitized-write'].includes(permission)
    })

    Menu.setApplicationMenu(null)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

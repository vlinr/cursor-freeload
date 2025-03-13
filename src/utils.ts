import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'

// 系统类型
export const SYSTEM = os.platform()

// 生成随机UUID
export function generateRandomUUID(customUUID?: string): string {
  if (customUUID) return customUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// 生成随机MAC地址
export function generateMacAddress(customMAC?: string): string {
  if (customMAC) return customMAC
  const hexDigits = '0123456789ABCDEF'
  let macAddress = ''
  for (let i = 0; i < 6; i++) {
    macAddress += hexDigits[Math.floor(Math.random() * 16)]
    macAddress += hexDigits[Math.floor(Math.random() * 16)]
    if (i < 5) macAddress += ':'
  }
  return macAddress
}

// 获取Cursor主程序路径
export function getCursorPath(): string {
  switch (SYSTEM) {
    case 'win32':
      // Windows下检查多个可能的安装路径
      const cursorDirs = ['Cursor', 'cursor']
      const winPaths = cursorDirs.flatMap(dir => [
        path.join(os.homedir(), 'AppData', 'Local', 'Programs', dir, 'resources', 'app', 'out', 'main.js'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', dir, 'resources', 'app', 'out', 'main.js'),
        path.join(process.env.PROGRAMFILES || '', dir, 'resources', 'app', 'out', 'main.js'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', dir, 'resources', 'app', 'out', 'main.js')
      ])

      for (const winPath of winPaths) {
        if (fs.existsSync(winPath)) {
          return winPath
        }
      }
      throw new Error('找不到Cursor程序，请检查以下路径：\n1. %USERPROFILE%\\AppData\\Local\\Programs\\Cursor\n2. %LOCALAPPDATA%\\Programs\\Cursor\n3. %PROGRAMFILES%\\Cursor\n4. %PROGRAMFILES(X86)%\\Cursor')

    case 'darwin':
      // macOS下检查多个可能的安装路径
      const macPaths = [
        path.join('/Applications', 'Cursor.app', 'Contents', 'Resources', 'app', 'out', 'main.js'),
        path.join(os.homedir(), 'Applications', 'Cursor.app', 'Contents', 'Resources', 'app', 'out', 'main.js'),
        path.join('/usr/local/bin', 'Cursor.app', 'Contents', 'Resources', 'app', 'out', 'main.js'),
        path.join(os.homedir(), '.local', 'bin', 'Cursor.app', 'Contents', 'Resources', 'app', 'out', 'main.js')
      ]
      
      for (const macPath of macPaths) {
        if (fs.existsSync(macPath)) {
          return macPath
        }
      }
      throw new Error('找不到Cursor程序，请检查以下路径：\n1. /Applications/Cursor.app\n2. ~/Applications/Cursor.app\n3. /usr/local/bin/Cursor.app\n4. ~/.local/bin/Cursor.app')

    case 'linux':
      // Linux下需要特殊处理AppImage格式
      const searchPaths = [
        '/usr/local/bin',
        '/opt',
        path.join(os.homedir(), 'Applications'),
        path.join(os.homedir(), '.local/bin'),
        path.join(os.homedir(), 'Downloads'),
        path.join(os.homedir(), 'Desktop'),
        os.homedir(),
        ...process.env.PATH?.split(path.delimiter) || []
      ]
      
      for (const searchPath of searchPaths) {
        try {
          const files = fs.readdirSync(searchPath)
          for (const file of files) {
            if (
              file.toLowerCase().startsWith('cursor') &&
              !file.substring(6, 7).match(/[a-zA-Z]/) &&
              file.toLowerCase().endsWith('.appimage')
            ) {
              const appImagePath = path.join(searchPath, file)
              if (fs.existsSync(appImagePath)) {
                const unpackedPath = unpackAppImage(appImagePath)
                const mainJSPath = path.join(unpackedPath, 'resources', 'app', 'out', 'main.js')
                if (fs.existsSync(mainJSPath)) {
                  return mainJSPath
                }
              }
            }
          }
        } catch (error) {
          continue
        }
      }
      throw new Error('找不到Cursor AppImage文件，请检查以下路径：\n1. /usr/local/bin\n2. /opt\n3. ~/Applications\n4. ~/.local/bin\n5. ~/Downloads\n6. ~/Desktop\n7. $HOME\n8. $PATH')

    default:
      throw new Error(`不支持的操作系统: ${SYSTEM}`)
  }
}

// 修改main.js文件
export function patchMainJS(mainJSPath: string, options: {
  machineId?: string;
  macAddress?: string;
  sqmId?: string;
  devDeviceId?: string;
}): void {
  if (!fs.existsSync(mainJSPath)) {
    throw new Error(`找不到目标文件: ${mainJSPath}`)
  }

  let content: string
  try {
    content = fs.readFileSync(mainJSPath, 'utf8')
  } catch (error) {
    throw new Error(`读取文件失败: ${(error as Error).message}`)
  }
  
  // 替换machineId
  const machineId = generateRandomUUID(options.machineId)
  content = content.replace(
    /=.{0,50}timeout.{0,10}5e3.*?,/,
    `=/*csp1*/${JSON.stringify(machineId)}/*1csp*/,`
  )

  // 替换MAC地址
  const macAddress = generateMacAddress(options.macAddress)
  content = content.replace(
    /\\x01return.{0,50}timeout.{0,10}5e3.*?,/,
    `return/*csp2*/${JSON.stringify(macAddress)}/*2csp*/,`
  )

  // 替换Windows SQM ID
  const sqmId = options.sqmId || ''
  content = content.replace(
    /return.{0,50}\.GetStringRegKey.*?HKEY_LOCAL_MACHINE.*?MachineId.*?\|\|.*?""/,
    `return/*csp3*/${JSON.stringify(sqmId)}/*3csp*/`
  )

  // 替换devDeviceId
  const devDeviceId = generateRandomUUID(options.devDeviceId)
  content = content.replace(
    /return.{0,50}vscode\/deviceid.*?getDeviceId\(\)/,
    `return/*csp4*/${JSON.stringify(devDeviceId)}/*4csp*/`
  )

  // 备份原文件
  const backupPath = `${mainJSPath}.backup`
  try {
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(mainJSPath, backupPath)
    }
  } catch (error) {
    throw new Error(`备份文件失败: ${(error as Error).message}`)
  }

  // 写入修改后的内容
  try {
    fs.writeFileSync(mainJSPath, content, 'utf8')
  } catch (error) {
    throw new Error(`写入文件失败: ${(error as Error).message}`)
  }
}

// 解压AppImage文件
export function unpackAppImage(appImagePath: string): string {
  if (SYSTEM !== 'linux') {
    throw new Error('AppImage只能在Linux系统下使用')
  }

  if (!fs.existsSync(appImagePath)) {
    throw new Error(`找不到AppImage文件: ${appImagePath}`)
  }

  const workDir = path.dirname(appImagePath)
  const squashfsDir = path.join(workDir, 'squashfs-root')

  // 如果已经解压过，直接返回解压目录
  if (fs.existsSync(squashfsDir)) {
    return squashfsDir
  }

  try {
    // 设置可执行权限
    fs.chmodSync(appImagePath, 0o755)
  } catch (error) {
    throw new Error(`设置AppImage可执行权限失败: ${(error as Error).message}`)
  }

  try {
    // 解压AppImage
    execSync(`${appImagePath} --appimage-extract`, { cwd: workDir })
  } catch (error) {
    throw new Error(`解压AppImage失败: ${(error as Error).message}`)
  }

  if (!fs.existsSync(squashfsDir)) {
    throw new Error('解压AppImage后未找到squashfs-root目录')
  }

  return squashfsDir
}
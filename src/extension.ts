import * as vscode from 'vscode'
import * as path from 'path'
import { getCursorPath, patchMainJS, unpackAppImage, SYSTEM } from './utils'

async function modifyCursorMainJS() {
  try {
    let mainJSPath = ''
    if (SYSTEM === 'linux') {
      try {
        const appImagePath = await getCursorPath()
        const unpackedPath = await unpackAppImage(appImagePath)
        mainJSPath = path.join(unpackedPath, 'app', 'out', 'main.js')
      } catch (error) {
        throw new Error(`Linux系统下解包AppImage失败: ${(error as Error).message}`)
      }
    } else {
      try {
        mainJSPath = await getCursorPath()
      } catch (error) {
        throw new Error(`获取Cursor路径失败: ${(error as Error).message}`)
      }
    }

    // 获取用户配置
    try {
      const config = vscode.workspace.getConfiguration('cursorFreeload')
      const options = {
        machineId: config.get('customMachineId'),
        macAddress: config.get('customMacAddress'),
        sqmId: config.get('customSqmId'),
        devDeviceId: config.get('customDevDeviceId')
      }

      // 验证配置值
      if (options.machineId && typeof options.machineId !== 'string') {
        throw new Error('自定义machineId必须是字符串类型')
      }
      if (options.macAddress && typeof options.macAddress !== 'string') {
        throw new Error('自定义macAddress必须是字符串类型')
      }
      if (options.sqmId && typeof options.sqmId !== 'string') {
        throw new Error('自定义sqmId必须是字符串类型')
      }
      if (options.devDeviceId && typeof options.devDeviceId !== 'string') {
        throw new Error('自定义devDeviceId必须是字符串类型')
      }
      // 修改main.js文件
      try {
        patchMainJS(mainJSPath, options as any)
      } catch (error) {
        throw new Error(`修改main.js文件失败: ${(error as Error).message}`)
      }

      return {
        success: true,
        message: '已成功修改 main.js 文件',
        path: mainJSPath
      }
    } catch (error) {
      throw new Error(`配置处理失败: ${(error as Error).message}`)
    }
  } catch (error) {
    throw new Error(`操作失败: ${(error as Error).message}`)
  }
}

async function killCursorProcesses() {
  return new Promise<void>((resolve, reject) => {
    const { exec } = require('child_process')
    const command = SYSTEM === 'win32' ? 'taskkill /F /IM "Cursor.exe" & taskkill /F /IM "cursor.exe"' :
                   SYSTEM === 'darwin' ? 'pkill -9 -i Cursor' :
                   SYSTEM === 'linux' ? 'pkill -9 -i cursor' :
                   ''
    
    if (!command) {
      reject(new Error('不支持的操作系统'))
      return
    }

    exec(command, (error: any) => {
      if (error) {
        // 特殊处理进程不存在的情况
        if (error.code === 1 || (error.message && (error.message.includes('没有运行的实例') || error.message.includes('no process found')))) {
          resolve() // 如果进程不存在，视为成功
          return
        }
        reject(new Error(`终止Cursor进程失败: ${error.message || '未知错误'}`))
        return
      }
      resolve()
    })
  })
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    'cursor-freeload.cursor-freeload',
    async function () {
      try {
        const result = await modifyCursorMainJS()

        vscode.window.showInformationMessage(
          `修改成功！\n路径: ${result.path}`,
        )

        const answer = await vscode.window.showWarningMessage(
          '修改成功！是否要重启 Cursor 使更改生效？',
          { modal: true },
          '是',
          '否',
        )

        if (answer === '是') {
          try {
            await killCursorProcesses()
            vscode.window.showInformationMessage('Cursor已成功终止，请手动重启应用')
          } catch (error) {
            vscode.window.showErrorMessage(
              `${(error as Error).message}`
            )
          }
        }
      } catch (error) {
        vscode.window.showErrorMessage(`${(error as Error).message}`)
      }
    },
  )

  context.subscriptions.push(disposable)
}

// This method is called when your extension is deactivated
export function deactivate() {}

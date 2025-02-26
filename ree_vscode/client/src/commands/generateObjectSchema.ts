import * as vscode from 'vscode'
import { getPackageEntryPath, getPackageNameFromPath } from '../utils/packageUtils'
import { getCurrentProjectDir } from '../utils/fileUtils'
import { 
  isReeInstalled,
  isBundleGemsInstalled,
  isBundleGemsInstalledInDocker,
  ExecCommand,
  genObjectSchemaJsonCommandArgsArray,
  buildReeCommandFullArgsArray,
  spawnCommand
} from '../utils/reeUtils'
import { PACKAGES_SCHEMA_FILE } from '../core/constants'
import { checkAndSortLinks } from './checkAndSortLinks'
import { checkExceptions } from './checkExceptions'
import { addDocumentProblems, ReeDiagnosticCode, removeDocumentProblems } from '../utils/documentUtils'
import { logErrorMessage } from '../utils/stringUtils'

const path = require('path')
const fs = require('fs')

export function genObjectSchemaCmd() {
  if (!vscode.workspace.workspaceFolders) {
    vscode.window.showInformationMessage("Error. Open workspace folder to use extension")
    return
  }

  let currentFilePath = null
  const activeEditor = vscode.window.activeTextEditor

  if (!activeEditor) {
    currentFilePath = vscode.workspace.workspaceFolders[0].uri.path
  } else {
    currentFilePath = activeEditor.document.uri.path
  }

  const projectPath = getCurrentProjectDir()
  if (!projectPath) {
    logErrorMessage(`Unable to find ${PACKAGES_SCHEMA_FILE}`)
    vscode.window.showErrorMessage(`Unable to find ${PACKAGES_SCHEMA_FILE}`)
    return
  }

  const currentPackageName = getPackageNameFromPath(currentFilePath)

  generateObjectSchema(activeEditor.document.fileName, false, currentPackageName)
}

export function generateObjectSchema(fileName: string, silent: boolean, packageName?: string) {
  if (!vscode.workspace.workspaceFolders) {
    vscode.window.showWarningMessage("Error. Open workspace folder to use extension")
    return
  }

  const isSpecFile = !!fileName.split("/").pop().match(/\_spec/)
  const isRubyFile = !!fileName.split("/").pop().match(/\.rb/)
  if (!isRubyFile) { return }

  let packageEntryFilePath = getPackageEntryPath(fileName)
  if (!packageEntryFilePath) { return }

  // check that we're inside a package
  let relativePackagePathToCurrentFilePath = path.relative(
    packageEntryFilePath.split("/").slice(0, -1).join("/"),
    fileName
  )
  if (relativePackagePathToCurrentFilePath.split('/').slice(0) === '..' && !isSpecFile) { return }

  let dateInFile = new Date(parseInt(fileName.split("/").pop().split("_")?.[0]))
  if (!isNaN(dateInFile?.getTime())) {
    return
  }

  const rootProjectDir = getCurrentProjectDir()
  if (!rootProjectDir) { return }

  // check if ree is installed
  const checkIsReeInstalled = isReeInstalled(rootProjectDir)?.then((res) => {
    if (res.code !== 0) {
      vscode.window.showWarningMessage(`CheckIsReeInstalledError: ${res.message}`)
      return null
    }
  })
  if (!checkIsReeInstalled) { return }

  const isBundleGemsInstalledResult = isBundleGemsInstalled(rootProjectDir)?.then((res) => {
    if (res.code !== 0) {
      vscode.window.showWarningMessage(`CheckIsBundleGemsInstalledError: ${res.message}`)
      return null
    }
  })
  if (!isBundleGemsInstalledResult) { return }

  const dockerPresented = vscode.workspace.getConfiguration('reeLanguageServer.docker').get('presented') as boolean
  if (dockerPresented) {
    const checkIsBundleGemsInstalledInDocker = isBundleGemsInstalledInDocker()?.then((res) => {
      if (res.code !== 0) {
        vscode.window.showWarningMessage(`CheckIsBundleGemsInstalledInDockerError: ${res.message}`)
        return null
      }
    })

    if (!checkIsBundleGemsInstalledInDocker) {
      vscode.window.showWarningMessage("Docker option is enabled, but bundle gems not found in Docker container")
      return
    }
  }

  let execPackageName = null

  if (packageName || packageName !== undefined) {
    execPackageName = packageName
  } else {
    const currentPackageName = getCurrentPackage(fileName)
    if (!currentPackageName) { return }

    execPackageName = currentPackageName
  }

  checkAndSortLinks(fileName)
  checkExceptions(fileName)
  
  // don't generate schema for specs
  if (isSpecFile) { return }

  const result = execGenerateObjectSchema(rootProjectDir, execPackageName, path.relative(rootProjectDir, fileName))

  if (!result) {
    logErrorMessage(`Can't generate Package.schema.json for ${execPackageName}`)
    vscode.window.showErrorMessage(`Can't generate Package.schema.json for ${execPackageName}`)
    return
  }
  
  result.then((commandResult) => {
    const documentUri = vscode.Uri.parse(fileName)
    removeDocumentProblems(documentUri, ReeDiagnosticCode.reeDiagnostic)

    if (commandResult.code !== 0) {
      const rPath = path.relative(
        rootProjectDir, documentUri.path
      )

      const line = commandResult.message.split("\n").find(s => s.includes(rPath + ":"))
      let lineNumber = 0

      if (line) {
        try {
          lineNumber = parseInt(line.split(rPath)[1].split(":")[1])
        } catch {}
      }

      if (lineNumber > 0) {
        lineNumber -= 1
      }

      const file = fs.readFileSync(fileName, { encoding: 'utf8' })
      if (file.length < lineNumber ) {
        lineNumber = 0
      }

      const character = file.split("\n")[lineNumber].length - 1
      let diagnostics: vscode.Diagnostic[] = []

      let diagnostic: vscode.Diagnostic = {
        severity: vscode.DiagnosticSeverity.Error,
        range: new vscode.Range(
          new vscode.Position(lineNumber, 0),
          new vscode.Position(lineNumber, character)
        ),
        message: commandResult.message,
        code: ReeDiagnosticCode.reeDiagnostic,
        source: 'ree'
      }

      diagnostics.push(diagnostic)
      addDocumentProblems(documentUri, diagnostics)

      return
    }
  
    if (!silent) {
      vscode.window.showInformationMessage(commandResult.message)
    }
  })
}

export async function execGenerateObjectSchema(rootProjectDir: string, name: string, objectPath: string): Promise<ExecCommand> {
  try {
    const appDirectory = vscode.workspace.getConfiguration('reeLanguageServer.docker').get('appDirectory') as string
    const projectDir = appDirectory ? appDirectory : rootProjectDir
    const fullArgsArr = buildReeCommandFullArgsArray(projectDir, genObjectSchemaJsonCommandArgsArray(projectDir, name, objectPath))

    return spawnCommand(fullArgsArr)
  } catch(e) {
    logErrorMessage(`Error. ${e.toString()}`)
    vscode.window.showErrorMessage(`Error. ${e.toString()}`)
    return undefined
  }
}

export function getCurrentPackage(fileName?: string): string | null {
  // check if active file/editor is accessible

  let currentFileName = fileName || vscode.window.activeTextEditor.document.fileName

  if (!currentFileName) {
    logErrorMessage("Open any package file")
    vscode.window.showErrorMessage("Open any package file")
    return
  }

  // finding package
  let currentPackage = getPackageNameFromPath(currentFileName)

  if (!currentPackage) { return }

  return currentPackage
}




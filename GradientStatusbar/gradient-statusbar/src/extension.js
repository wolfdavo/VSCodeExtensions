// ####### CREDIT ##########
// The custom CSS injection capability of this extension is copied from the extension "Custom CSS and JS loader"
// https://github.com/be5invis/GRADIENT-STATUSBAR

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const msg = require("./messages").messages;
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const fileUrl = require("file-url");
const uuid = require("uuid");
const { config } = require("process");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	console.log('Gradient Statusbar is active!');

	process.on("uncaughtException", function (err) {
		if (/ENOENT|EACCES|EPERM/.test(err.code)) {
			vscode.window.showInformationMessage(msg.admin);
			return;
		}
	});

	const appDir = path.dirname(require.main.filename);
	const base = path.join(appDir, "vs", "code");
	const htmlFile = path.join(base, "electron-browser", "workbench", "workbench.html");
	const BackupFilePath = uuid =>
		path.join(base, "electron-browser", "workbench", `workbench.${uuid}.bak-gradient-statusbar`);
	const cssFilePath = fileUrl(__dirname + "/gradientStatusbar.css");

	//Statusbar button
	const gradientToggleCommand = "gradient-statusbar.toggleGradient";
	context.subscriptions.push(vscode.commands.registerCommand(gradientToggleCommand, () => {
		vscode.window.showInformationMessage("Updated gradient");
		fUpdate(); //Updates the extension
	}))

	// create a new status bar item that we can now manage
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.command = gradientToggleCommand;
	statusBarItem.text = "Toggle GS";
	context.subscriptions.push(statusBarItem);
	statusBarItem.show();

	function httpGet(theUrl) {
		const xmlHttp = new XMLHttpRequest();
		xmlHttp.open("GET", theUrl, false);
		xmlHttp.send(null);
		return xmlHttp.responseText;
	}

	// ###### Main commands ########

	function fInstall() {
		deleteBackupFiles();
		const uuidSession = uuid.v4();
		const c = fs
			.createReadStream(htmlFile)
			.pipe(fs.createWriteStream(BackupFilePath(uuidSession)));
		c.on("finish", () => performPatch(uuidSession));
	}

	function fUpdate() {
		fUninstallImpl(true);
	}

	function fUninstall() {
		fUninstallImpl(false);
	}

	function fUninstallImpl(willReinstall) {
		fs.stat(htmlFile, function (errHtml, statsHtml) {
			if (errHtml) return vscode.window.showInformationMessage(msg.somethingWrong + errHtml);
			const backupUuid = getBackupUuid(htmlFile);
			if (!backupUuid) return uninstallComplete(true, willReinstall);

			const backupPath = BackupFilePath(backupUuid);
			fs.stat(backupPath, function (errBak, statsBak) {
				if (errBak) {
					uninstallComplete(true, willReinstall);
				} else {
					restoreBak(backupPath, willReinstall);
				}
			});
		});
	}

	// ####### Support commands ########

	function getBackupUuid(htmlFile) {
		const htmlContent = fs.readFileSync(htmlFile, "utf-8");
		const m = htmlContent.match(/<!-- !! GRADIENT-STATUSBAR-SESSION-ID ([0-9a-fA-F-]+) !! -->/);
		if (!m) return null;
		else return m[1];
	}

	function performPatch(uuidSession) {
		const config = vscode.workspace.getConfiguration("gradient-statusbar");
		if (!patchIsProperlyConfigured(config))
			return vscode.window.showInformationMessage(msg.notConfigured);

		let html = fs.readFileSync(htmlFile, "utf-8");
		html = clearExistingPatches(html);

		const injectHTML = computeInjectedHTMLItem(cssFilePath);
		if (config.policy)
			html = html.replace(/<meta.*http-equiv="Content-Security-Policy".*>/, "");

		/* let indicatorJS = "";
		if (config.statusbar) {
			indicatorJS = `<script src="${fileUrl(__dirname + "/statusbar.js")}"></script>\n`;
		} */

		html = html.replace(
			/(<\/html>)/,
			`<!-- !! GRADIENT-STATUSBAR-SESSION-ID ${uuidSession} !! -->\n` +
				"<!-- !! GRADIENT-STATUSBAR-START !! -->\n" +
				indicatorJS +
				injectHTML +
				"<!-- !! GRADIENT-STATUSBAR-END !! -->\n</html>"
		);
		fs.writeFileSync(htmlFile, html, "utf-8");
		enabledRestart();
	}
	function clearExistingPatches(html) {
		html = html.replace(
			/<!-- !! GRADIENT-STATUSBAR-START !! -->[\s\S]*?<!-- !! GRADIENT-STATUSBAR-END !! -->\n*/,
			""
		);
		html = html.replace(/<!-- !! GRADIENT-STATUSBAR-SESSION-ID [\w-]+ !! -->\n*/g, "");
		return html;
	}
	function patchIsProperlyConfigured(config) {
		return !!config //&& config.imports && config.imports instanceof Array;
	}

	function computeInjectedHTMLItem(x) {
		if (!x) return "";
		if (typeof x !== "string") return "";

		if (/^((file:.*\.css)|(data:.*css.*))$/.test(x))
			return '<link rel="stylesheet" href="' + x + '"/>\n';

		if (/^http.*\.css$/.test(x)) return "<style>" + httpGet(x) + "</style>\n";
	}

	function uninstallComplete(succeeded, willReinstall) {
		if (!succeeded) return;
		if (willReinstall) {
			fInstall();
		} else {
			deleteBackupFiles();
			disabledRestart();
		}
	}

	function restoreBak(backupFilePath, willReinstall) {
		fs.unlink(htmlFile, function (err) {
			if (err) {
				vscode.window.showInformationMessage(msg.admin);
				return;
			}
			const c = fs.createReadStream(backupFilePath).pipe(fs.createWriteStream(htmlFile));
			c.on("finish", function () {
				uninstallComplete(true, willReinstall);
			});
		});
	}

	function deleteBackupFiles() {
		const htmlDir = path.dirname(htmlFile);
		const htmlDirItems = fs.readdirSync(htmlDir);
		for (const item of htmlDirItems) {
			if (item.endsWith(".bak-gradient-statusbar")) fs.unlinkSync(path.join(htmlDir, item));
		}
	}

	function reloadWindow() {
		// reload vscode-window
		vscode.commands.executeCommand("workbench.action.reloadWindow");
	}
	function enabledRestart() {
		vscode.window
			.showInformationMessage(msg.enabled, { title: msg.restartIde })
			.then(reloadWindow);
	}
	function disabledRestart() {
		vscode.window
			.showInformationMessage(msg.disabled, { title: msg.restartIde })
			.then(reloadWindow);
	}

	const installGradientStatusbar = vscode.commands.registerCommand(
		"extension.installGradientStatusbar",
		fInstall
	);
	const uninstallGradientStatusbar = vscode.commands.registerCommand(
		"extension.uninstallGradientStatusbar",
		fUninstall
	);
	const updateGradientStatusbar = vscode.commands.registerCommand("extension.updateGradientStatusbar", fUpdate);

	context.subscriptions.push(installGradientStatusbar);
	context.subscriptions.push(uninstallGradientStatusbar);
	context.subscriptions.push(updateGradientStatusbar);
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}

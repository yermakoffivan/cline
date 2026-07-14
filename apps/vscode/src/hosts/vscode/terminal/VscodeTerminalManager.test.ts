import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "mocha"
import * as sinon from "sinon"
import * as vscode from "vscode"
import { setVscodeHostProviderMock } from "@/test/host-provider-test-utils"
import { VscodeTerminalManager } from "./VscodeTerminalManager"
import { TerminalInfo, TerminalRegistry } from "./VscodeTerminalRegistry"

function createNeverEndingStream(): AsyncIterable<string> {
	return {
		async *[Symbol.asyncIterator]() {
			await new Promise(() => {})
		},
	}
}

describe("VscodeTerminalManager", () => {
	let sandbox: sinon.SinonSandbox
	let manager: VscodeTerminalManager

	beforeEach(() => {
		sandbox = sinon.createSandbox({ useFakeTimers: true })
		manager = new VscodeTerminalManager()
	})

	afterEach(() => {
		manager.disposeAll()
		sandbox.restore()
	})

	it("returns after timing out a reused terminal cwd command", async () => {
		const targetCwd = "/tmp/cline-target"
		const executeCommandStub = sandbox.stub().returns({
			read: () => createNeverEndingStream(),
		})
		const terminalInfo: TerminalInfo = {
			id: 1,
			busy: false,
			lastCommand: "",
			lastActive: Date.now(),
			terminal: {
				shellIntegration: {
					cwd: vscode.Uri.file("/tmp/cline-original"),
					executeCommand: executeCommandStub,
				},
				show: sandbox.stub(),
			} as unknown as vscode.Terminal,
		}
		const getAllTerminalsStub = sandbox.stub(TerminalRegistry, "getAllTerminals").returns([terminalInfo])

		let didResolve = false
		const terminalPromise = manager.getOrCreateTerminal(targetCwd).then((terminal) => {
			didResolve = true
			return terminal
		})

		await sandbox.clock.tickAsync(4999)
		assert.equal(didResolve, false)

		await sandbox.clock.tickAsync(1)
		const terminal = await terminalPromise

		assert.equal(terminal, terminalInfo)
		assert.equal(terminalInfo.busy, false)
		assert.equal(terminalInfo.pendingCwdChange, undefined)
		assert.equal(terminalInfo.cwdResolved, undefined)
		assert.equal(getAllTerminalsStub.called, true)
		assert.equal(executeCommandStub.calledOnceWith(`cd "${targetCwd}"`), true)
	})

	// Terminals whose shell integration never activates fall back to sendText,
	// after which their commands can no longer be observed. If such terminals
	// are only untracked (not closed), each one leaves a live shell that may
	// still be running its command, and they pile up as "running" terminals
	// that block subsequent commands (cline/cline#11550). Drive several
	// commands through the real fallback path and verify every terminal is
	// disposed and evicted from the registry.
	it("disposes terminals after the no-shell-integration fallback so they cannot accumulate", async () => {
		setVscodeHostProviderMock()
		const createdTerminals: TerminalInfo[] = []
		const disposeSpies: sinon.SinonSpy[] = []

		try {
			for (let i = 0; i < 3; i++) {
				const terminalInfo = TerminalRegistry.createTerminal()
				createdTerminals.push(terminalInfo)
				sandbox.stub(terminalInfo.terminal, "shellIntegration").get(() => undefined)
				// Keep the (possibly long-running) command from reaching the real shell.
				sandbox.stub(terminalInfo.terminal, "sendText")
				disposeSpies.push(sandbox.spy(terminalInfo.terminal, "dispose"))

				const process = manager.runCommand(
					terminalInfo as unknown as Parameters<VscodeTerminalManager["runCommand"]>[0],
					`sleep 999 # command ${i}`,
				)
				await sandbox.clock.tickAsync(4000) // shell integration activation wait times out
				await sandbox.clock.tickAsync(3000) // fallback output-capture delay
				await process
			}

			const liveIds = new Set(TerminalRegistry.getAllTerminals().map((t) => t.id))
			for (const [i, terminalInfo] of createdTerminals.entries()) {
				assert.equal(disposeSpies[i].calledOnce, true, `terminal ${terminalInfo.id} must be disposed`)
				assert.equal(liveIds.has(terminalInfo.id), false, `terminal ${terminalInfo.id} must leave the registry`)
			}
		} finally {
			// On assertion failure, close whatever the manager left behind.
			for (const [i, terminalInfo] of createdTerminals.entries()) {
				if (!disposeSpies[i].called) {
					terminalInfo.terminal.dispose()
					TerminalRegistry.removeTerminal(terminalInfo.id)
				}
			}
		}
	})
})

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const TEMPORARY_PROJECTS_ROOT = join(tmpdir(), ".cline");

const temporaryWorkspaces = new Set<string>();

export function createTemporaryWorkspace(): string {
	mkdirSync(TEMPORARY_PROJECTS_ROOT, { recursive: true });
	const workspacePath = mkdtempSync(
		join(TEMPORARY_PROJECTS_ROOT, "new-project-"),
	);
	temporaryWorkspaces.add(workspacePath);
	return workspacePath;
}

export function releaseTemporaryWorkspace(workspacePath: string): boolean {
	const ownedWorkspacePath = workspacePath.trim();
	if (!temporaryWorkspaces.has(ownedWorkspacePath)) {
		return false;
	}
	rmSync(ownedWorkspacePath, { recursive: true, force: true });
	temporaryWorkspaces.delete(ownedWorkspacePath);
	return true;
}

export function cleanupTemporaryWorkspaces(): void {
	for (const workspacePath of temporaryWorkspaces) {
		try {
			rmSync(workspacePath, { recursive: true, force: true });
		} catch {
			// Best-effort cleanup during shutdown. The OS may already have removed it.
		}
	}
	temporaryWorkspaces.clear();
}

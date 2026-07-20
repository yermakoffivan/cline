import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	cleanupTemporaryWorkspaces,
	createTemporaryWorkspace,
	releaseTemporaryWorkspace,
	TEMPORARY_PROJECTS_ROOT,
} from "./temporary-workspaces";

describe("temporary workspaces", () => {
	afterEach(() => {
		cleanupTemporaryWorkspaces();
	});

	it("creates owned workspaces under the system temporary root", () => {
		const workspacePath = createTemporaryWorkspace();

		expect(dirname(workspacePath)).toBe(TEMPORARY_PROJECTS_ROOT);
		expect(existsSync(workspacePath)).toBe(true);
	});

	it("releases only workspaces created by this process", () => {
		const workspacePath = createTemporaryWorkspace();

		expect(releaseTemporaryWorkspace(workspacePath)).toBe(true);
		expect(existsSync(workspacePath)).toBe(false);
		expect(releaseTemporaryWorkspace(workspacePath)).toBe(false);
		expect(
			releaseTemporaryWorkspace(
				join(TEMPORARY_PROJECTS_ROOT, "new-project-unowned"),
			),
		).toBe(false);
	});

	it("cleans up all remaining owned workspaces", () => {
		const firstWorkspace = createTemporaryWorkspace();
		const secondWorkspace = createTemporaryWorkspace();

		cleanupTemporaryWorkspaces();

		expect(existsSync(firstWorkspace)).toBe(false);
		expect(existsSync(secondWorkspace)).toBe(false);
	});
});

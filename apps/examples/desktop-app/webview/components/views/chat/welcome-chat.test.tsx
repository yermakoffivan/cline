// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceProvider } from "@/contexts/workspace-context";
import { WelcomeScreen } from "./welcome-chat";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	window.matchMedia = vi.fn(() => ({
		matches: true,
		media: "",
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	}));
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.restoreAllMocks();
});

async function clickButton(label: string): Promise<void> {
	const button = [
		...container.querySelectorAll<HTMLButtonElement>("button"),
	].find((candidate) => candidate.textContent?.includes(label));
	expect(button).toBeDefined();
	await act(async () => {
		button?.click();
		await Promise.resolve();
	});
}

function renderWelcome(options: {
	workspaceRoot: string;
	newProjectSelected?: boolean;
	workspaces?: string[];
	createTemporaryWorkspace?: () => Promise<boolean>;
}) {
	const workspaces = options.workspaces ?? [];
	return act(async () => {
		root.render(
			<WorkspaceProvider
				value={{
					workspaceRoot: options.workspaceRoot,
					newProjectSelected: options.newProjectSelected ?? false,
					workspaces,
					listWorkspaces: vi.fn(async () => workspaces),
					refreshWorkspaces: vi.fn(async () => undefined),
					switchWorkspace: vi.fn(async () => true),
					pickWorkspaceDirectory: vi.fn(async () => null),
					createTemporaryWorkspace:
						options.createTemporaryWorkspace ?? vi.fn(async () => true),
				}}
			>
				<WelcomeScreen
					active
					body={null}
					composer={null}
					gitBranch="no-git"
					onListGitBranches={vi.fn(async () => ({
						current: "no-git",
						branches: [],
					}))}
					onStartChat={vi.fn()}
					onSwitchGitBranch={vi.fn(async () => true)}
					quickActions={[]}
				/>
			</WorkspaceProvider>,
		);
	});
}

describe("WelcomeScreen", () => {
	it("prompts for a workspace and offers an ephemeral new project", async () => {
		const createTemporaryWorkspace = vi.fn(async () => true);
		await renderWelcome({ workspaceRoot: "", createTemporaryWorkspace });

		expect(container.textContent).toContain("Select a Workspace");
		expect(
			container.querySelector<HTMLButtonElement>('button[title="No branch"]')
				?.disabled,
		).toBe(true);
		await clickButton("Select a Workspace");
		expect(container.textContent).toContain("Add project...");
		expect(container.textContent).toContain("New project");

		await clickButton("New project");
		expect(createTemporaryWorkspace).toHaveBeenCalledOnce();
	});

	it("labels a temporary workspace as a new project", async () => {
		await renderWelcome({
			workspaceRoot: "/tmp/.cline/new-project-a1b2c3",
		});

		expect(container.textContent).toContain("New Project");
		expect(container.textContent).not.toContain("new-project-a1b2c3");
	});

	it("replaces the selected workspace label for a new project", async () => {
		await renderWelcome({
			workspaceRoot: "",
			newProjectSelected: true,
			workspaces: ["/projects/current"],
		});

		expect(container.textContent).toContain("New Project");
		expect(container.textContent).not.toContain("Select a Workspace");
		expect(
			container.querySelector<HTMLButtonElement>('button[title="No branch"]')
				?.disabled,
		).toBe(true);
	});

	it("lists every known project in the opened picker", async () => {
		const workspaces = Array.from(
			{ length: 6 },
			(_, index) => `/projects/project-${index + 1}`,
		);
		await renderWelcome({ workspaceRoot: workspaces[0] ?? "", workspaces });
		await clickButton("project-1");

		for (let index = 1; index <= workspaces.length; index += 1) {
			expect(container.textContent).toContain(`project-${index}`);
		}
	});
});

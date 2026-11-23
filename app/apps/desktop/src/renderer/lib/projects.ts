import type { ProjectFolderSelection } from "@sage/contracts/projects";

/** The native folder dialog, then what the backend finds in the chosen folder; null when cancelled. */
export async function chooseProjectFolder(): Promise<ProjectFolderSelection | null> {
  const rootPath = await window.sage.dialogs.chooseProjectFolder();
  return rootPath ? await window.sage.projects.inspectFolder({ rootPath }) : null;
}

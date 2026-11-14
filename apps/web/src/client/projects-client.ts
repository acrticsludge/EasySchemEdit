// apps/web/src/client/projects-client.ts
// Typed client fetch wrappers for EasySchemEdit cloud projects API.

export interface CloudProjectSummary {
  id: string;
  name: string;
  revision: number;
  placementCount: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCloudProjectMeta {
  revision?: number;
  placementCount?: number;
}

export interface SaveCloudProjectMeta {
  name?: string;
  revision?: number;
  placementCount?: number;
}

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    if (data.error) return data.error;
    if (data.message) return data.message;
  } catch {
    // Non-JSON response
  }
  return `${fallback} (${res.status} ${res.statusText})`;
}

/**
 * Lists all cloud projects owned by the currently authenticated user.
 */
export async function listCloudProjects(): Promise<CloudProjectSummary[]> {
  const res = await fetch('/api/projects', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'Failed to list cloud projects');
    throw new Error(msg);
  }

  const data = (await res.json()) as { projects?: CloudProjectSummary[] };
  return data.projects ?? [];
}

/**
 * Creates a new cloud project.
 * If archiveBytes is provided, uploads the .vxproj archive binary in the request body.
 */
export async function createCloudProject(
  name: string,
  archiveBytes?: Uint8Array,
  meta?: CreateCloudProjectMeta,
): Promise<CloudProjectSummary> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  let body: BodyInit;

  if (archiveBytes && archiveBytes.byteLength > 0) {
    headers['Content-Type'] = 'application/zip';
    headers['X-Project-Name'] = encodeURIComponent(name.trim() || 'Untitled Project');
    if (meta?.revision !== undefined) {
      headers['X-Revision'] = String(meta.revision);
    }
    if (meta?.placementCount !== undefined) {
      headers['X-Placement-Count'] = String(meta.placementCount);
    }
    body = archiveBytes as unknown as BodyInit;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ name: name.trim() || 'Untitled Project' });
  }

  const res = await fetch('/api/projects', {
    method: 'POST',
    headers,
    body,
  });

  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'Failed to create cloud project');
    throw new Error(msg);
  }

  const data = (await res.json()) as { project: CloudProjectSummary };
  return data.project;
}

/**
 * Saves/updates an existing cloud project's .vxproj archive binary.
 */
export async function saveCloudProjectArchive(
  id: string,
  archiveBytes: Uint8Array,
  meta?: SaveCloudProjectMeta,
): Promise<CloudProjectSummary> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/zip',
    Accept: 'application/json',
  };

  if (meta?.name) {
    headers['X-Project-Name'] = encodeURIComponent(meta.name.trim());
  }
  if (meta?.revision !== undefined) {
    headers['X-Revision'] = String(meta.revision);
  }
  if (meta?.placementCount !== undefined) {
    headers['X-Placement-Count'] = String(meta.placementCount);
  }

  const res = await fetch(`/api/projects/${encodeURIComponent(id)}/archive`, {
    method: 'PUT',
    headers,
    body: archiveBytes as unknown as BodyInit,
  });

  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'Failed to save cloud project archive');
    throw new Error(msg);
  }

  const data = (await res.json()) as { project: CloudProjectSummary };
  return data.project;
}

/**
 * Loads the raw .vxproj archive binary for a cloud project.
 */
export async function loadCloudProjectArchive(id: string): Promise<Uint8Array> {
  const res = await fetch(`/api/projects/${encodeURIComponent(id)}/archive`, {
    method: 'GET',
    headers: {
      Accept: 'application/zip, application/octet-stream, */*',
    },
  });

  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'Failed to load cloud project archive');
    throw new Error(msg);
  }

  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Retrieves metadata for a single cloud project.
 */
export async function getCloudProject(id: string): Promise<CloudProjectSummary> {
  const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'Failed to get cloud project');
    throw new Error(msg);
  }

  const data = (await res.json()) as { project: CloudProjectSummary };
  return data.project;
}

/**
 * Renames a cloud project.
 */
export async function renameCloudProject(
  id: string,
  name: string,
): Promise<CloudProjectSummary> {
  const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ name: name.trim() }),
  });

  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'Failed to rename cloud project');
    throw new Error(msg);
  }

  const data = (await res.json()) as { project: CloudProjectSummary };
  return data.project;
}

/**
 * Deletes a cloud project from storage and database.
 */
export async function deleteCloudProject(id: string): Promise<void> {
  const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'Failed to delete cloud project');
    throw new Error(msg);
  }
}

import { ARTIFACT_ROOT, CONTRACT_VERSION, artifactSchema, catalogSchema, relativePath, type Artifact, type Source } from './contract.js';
import { Git } from './git.js';
import { GitHub, type FileChanges } from './github.js';
import { checksum, MAX_PACKAGE_BYTES, type Package } from './package.js';

const catalogPath = `${ARTIFACT_ROOT}/catalog.json`;
const serialize = (value: unknown): Buffer => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
const assetPaths = (manifest: Artifact): string[] => ['manifest.json',
  ...manifest.files.map((file) => file.file), ...manifest.diagrams.map((diagram) => diagram.file)];
const prefix = (pr: number): string => `${ARTIFACT_ROOT}/pr-${pr}/`;
const parents = (path: string): string[] => path.split('/').slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join('/'));

async function state(git: Git, source: Source) {
  const records = (await git.text(['ls-tree', '-r', '-z', '--full-tree', source.headSha, '--', ARTIFACT_ROOT])).split('\0').filter(Boolean);
  const entries = new Map(records.map((record) => {
    const tab = record.indexOf('\t');
    if (tab < 0) throw new Error('Invalid artifact tree entry');
    return [relativePath.parse(record.slice(tab + 1)), record.slice(0, tab).split(' ')[0]!] as const;
  }));
  const catalog = entries.has(catalogPath)
    ? catalogSchema.parse(JSON.parse((await git.file(source.headSha, catalogPath)).text))
    : { version: CONTRACT_VERSION, repository: source.repository, artifacts: [] };
  if (catalog.repository.toLowerCase() !== source.repository.toLowerCase()) throw new Error('Catalog belongs to a different repository');
  const listed = catalog.artifacts.find((item) => item.pr === source.pr);
  const previous = listed ? artifactSchema.parse(JSON.parse((await git.file(source.headSha, `${ARTIFACT_ROOT}/${listed.manifest}`)).text)) : undefined;
  if (previous && (previous.source.pr !== source.pr || previous.source.repository.toLowerCase() !== source.repository.toLowerCase())) {
    throw new Error('Previous generation belongs to a different PR');
  }
  return { entries, catalog, previous };
}

export async function currentGeneration(git: Git, source: Source): Promise<string | null> {
  return (await state(git, source)).previous?.generation ?? null;
}

function completeAssets(pkg: Package): Map<string, Buffer> {
  const manifest = artifactSchema.parse(pkg.manifest);
  const expected = new Set(assetPaths(manifest));
  if (pkg.assets.size !== expected.size || [...pkg.assets.keys()].some((path) => !expected.has(path))) throw new Error('Incomplete or unexpected package assets');
  for (const file of [...manifest.files, ...manifest.diagrams]) {
    const bytes = pkg.assets.get(file.file);
    if (!bytes || checksum(bytes) !== file.sha256) throw new Error(`Incomplete or modified package asset: ${file.file}`);
  }
  if (!pkg.assets.get('manifest.json')?.equals(serialize(manifest))) throw new Error('Package manifest bytes do not match its data');
  if ([...pkg.assets.values()].reduce((total, bytes) => total + bytes.length, 0) > MAX_PACKAGE_BYTES) throw new Error('Package exceeds the reader import limit');
  return new Map([...pkg.assets].map(([path, bytes]) => [prefix(manifest.source.pr) + path, bytes]));
}

export async function publishArtifact(git: Git, github: GitHub, pkg: Package, expectedGeneration: string | null): Promise<string> {
  const additions = completeAssets(pkg);
  const { source } = pkg.manifest;
  const { entries, catalog, previous } = await state(git, source);
  if ((previous?.generation ?? null) !== expectedGeneration) throw new Error('Expected generation does not match; inspect before explicitly regenerating');
  const owned = new Set(previous ? assetPaths(previous).map((path) => prefix(source.pr) + path) : []);
  if (entries.has(catalogPath)) owned.add(catalogPath);
  additions.set(catalogPath, serialize(catalogSchema.parse({ ...catalog, artifacts: [
    ...catalog.artifacts.filter((item) => item.pr !== source.pr), { pr: source.pr, manifest: `pr-${source.pr}/manifest.json` },
  ].sort((left, right) => left.pr - right.pr) })));
  for (const [path, mode] of entries) {
    const affected = additions.has(path) || parents(path).some((parent) => additions.has(parent));
    if ((affected && !owned.has(path)) || (owned.has(path) && !['100644', '100755'].includes(mode))) {
      throw new Error(`Unowned or nonregular artifact collision: ${path}`);
    }
  }
  for (const path of additions.keys()) {
    if (parents(path).some((parent) => entries.has(parent))) throw new Error(`Artifact parent is not a directory: ${path}`);
  }
  const changes: FileChanges = {
    additions: [...additions].map(([path, bytes]) => ({ path, contents: bytes.toString('base64') })),
    deletions: [...owned].filter((path) => !additions.has(path) && entries.has(path)).map((path) => ({ path })),
  };
  return github.publish(source, changes);
}

import type { BlockStateId } from './block-state.ts';

export function parseBlockStateString(s: string): BlockStateId {
  let idPart: string;
  let propsStr: string | undefined;

  const bracketIdx = s.indexOf('[');
  if (bracketIdx === -1) {
    idPart = s;
  } else if (bracketIdx === 0) {
    throw new Error(`Invalid block-state string: missing ID before '[' in '${s}'`);
  } else {
    idPart = s.slice(0, bracketIdx);
    const closingIdx = s.lastIndexOf(']');
    if (closingIdx !== s.length - 1) {
      throw new Error(`Invalid block-state string: trailing content after ']' in '${s}'`);
    }
    propsStr = s.slice(bracketIdx + 1, closingIdx);
  }

  const id = idPart.toLowerCase();
  const props: Record<string, string> = {};

  if (propsStr !== undefined && propsStr.trim() !== '') {
    const pairs = propsStr.split(',');
    for (const pair of pairs) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) {
        throw new Error(`Invalid block-state property: missing '=' in '${pair}' of '${s}'`);
      }
      const rawKey = pair.slice(0, eqIdx);
      const rawValue = pair.slice(eqIdx + 1);
      const key = rawKey.toLowerCase();
      const value = rawValue.toLowerCase();
      if (key === '' || value === '') {
        throw new Error(`Invalid block-state property: empty key or value in '${pair}' of '${s}'`);
      }
      if (!/^[a-z0-9_]+$/.test(rawKey)) {
        throw new Error(`Invalid block-state property key: '${rawKey}' in '${s}'`);
      }
      if (!/^[a-z0-9_]+$/.test(rawValue)) {
        throw new Error(`Invalid block-state property value: '${rawValue}' in '${s}'`);
      }
      props[key] = value;
    }
  }

  return { id, props: props as Readonly<Record<string, string>> };
}

export function formatBlockStateString(id: BlockStateId): string {
  const keys = Object.keys(id.props).sort();
  if (keys.length === 0) {
    return id.id;
  }
  const propsStr = keys.map((k) => `${k}=${id.props[k]}`).join(',');
  return `${id.id}[${propsStr}]`;
}

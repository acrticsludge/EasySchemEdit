'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export default function EditorIsland() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const selectedRef = useRef<Set<THREE.Mesh>>(new Set());
  const [status, setStatus] = useState('Drop a .schem or .litematic file here');
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 10000);
    camera.position.set(50, 50, 50);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(100, 200, 100);
    scene.add(dir);

    const grid = new THREE.GridHelper(100, 100, 0x444444, 0x222222);
    scene.add(grid);

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (event: MouseEvent) => {
      if (!container || !cameraRef.current || !sceneRef.current) return;
      const rect = container.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, cameraRef.current);

      const blockGroup = sceneRef.current.getObjectByName('blocks');
      if (!blockGroup) return;

      const intersects = raycaster.intersectObjects(blockGroup.children, false);
      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const mat = hit.material as THREE.MeshLambertMaterial;
        if (selectedRef.current.has(hit)) {
          selectedRef.current.delete(hit);
          mat.emissive.setHex(0x000000);
        } else {
          selectedRef.current.add(hit);
          mat.emissive.setHex(0x444400);
        }
        setSelectedCount(selectedRef.current.size);
      } else {
        // Deselect all
        selectedRef.current.forEach((m) => {
          (m.material as THREE.MeshLambertMaterial).emissive.setHex(0x000000);
        });
        selectedRef.current.clear();
        setSelectedCount(0);
      }
    };
    container.addEventListener('click', onClick);

    return () => {
      window.removeEventListener('resize', onResize);
      container.removeEventListener('click', onClick);
      cancelAnimationFrame(animId);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setStatus('Loading...');
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // NbtServices using browser's DecompressionStream
      const services = {
        gzipCompress: (b: Uint8Array) => b,
        gzipDecompress: async (b: Uint8Array, max: number) => {
          const ds = new DecompressionStream('gzip');
          const writer = ds.writable.getWriter();
          writer.write(b);
          writer.close();
          const reader = ds.readable.getReader();
          const chunks: Uint8Array[] = [];
          let total = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            total += value.length;
            if (total > max) throw new Error('decompressed too large');
          }
          const result = new Uint8Array(total);
          let off = 0;
          for (const c of chunks) { result.set(c, off); off += c.length; }
          return result;
        },
      };

      const { decodeNbtFromBytes } = await import('@easyschemedit/formats');
      const root = decodeNbtFromBytes(bytes) as any;
      if (root.type !== 'compound') throw new Error('Not a compound NBT');

      const entries = root.value as Map<string, any>;

      // Check if Litematic (has Regions)
      const regions = entries.get('Regions')?.value as Map<string, any> | undefined;
      let totalBlocks = 0;
      let totalNonAir = 0;

      // Scene setup
      const scene = sceneRef.current;
      if (!scene) throw new Error('Scene not ready');

      // Clear previous blocks
      const oldBlocks = scene.getObjectByName('blocks');
      if (oldBlocks) scene.remove(oldBlocks);
      const blockGroup = new THREE.Group();
      blockGroup.name = 'blocks';

      const colorMap: Record<string, number> = {
        'minecraft:stone': 0x7f7f7f,
        'minecraft:dirt': 0x866043,
        'minecraft:grass_block': 0x5a8a3c,
        'minecraft:oak_planks': 0xb8945f,
        'minecraft:cobblestone': 0x7a7a7a,
        'minecraft:oak_log': 0x9a7a4a,
        'minecraft:glass': 0xadd8e6,
        'minecraft:water': 0x3f76e4,
        'minecraft:lava': 0xcf5f0a,
      };

      function getColor(name: string): number {
        return colorMap[name] ?? (Math.abs(name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 0xffffff);
      }

      function decodeVarInts(data: Uint8Array): number[] {
        const indices: number[] = [];
        let byteOffset = 0;
        while (byteOffset < data.length) {
          let result = 0;
          let bytesRead = 0;
          let byte: number;
          do {
            byte = data[byteOffset + bytesRead];
            result |= (byte & 0x7F) << (7 * bytesRead);
            bytesRead++;
          } while ((byte & 0x80) !== 0 && bytesRead < 5);
          indices.push(result);
          byteOffset += bytesRead;
        }
        return indices;
      }

      if (regions) {
        // Litematic format
        for (const [regionName, regionEntry] of regions) {
          const region = regionEntry.value as Map<string, any>;
          const pos = region.get('Position')?.value as number[] ?? [0, 0, 0];
          const size = region.get('Size')?.value as number[] ?? [0, 0, 0];
          const paletteEntry = region.get('BlockStatePalette')?.value as any[] ?? [];
          const blockStatesEntry = region.get('BlockStates')?.value;

          const ax = Math.abs(size[0] ?? 1);
          const ay = Math.abs(size[1] ?? 1);
          const az = Math.abs(size[2] ?? 1);
          const paletteNames: string[] = paletteEntry.map((e: any) => {
            const name = e.value?.get?.('Name')?.value ?? 'minecraft:air';
            return name;
          });

          let indices: number[] = [];
          if (blockStatesEntry?.value instanceof BigInt64Array || Array.isArray(blockStatesEntry?.value)) {
            // Convert longs to bytes, then decode packed
            // For simplicity, try direct byte array first
            if (blockStatesEntry.value instanceof Uint8Array) {
              indices = decodeVarInts(blockStatesEntry.value);
            }
          }

          const total = ax * ay * az;
          totalBlocks += total;
          for (let i = 0; i < Math.min(indices.length, total); i++) {
            const idx = indices[i];
            const name = idx >= 0 && idx < paletteNames.length ? paletteNames[idx] : 'minecraft:air';
            if (name === 'minecraft:air' || name === 'minecraft:cave_air' || name === 'minecraft:void_air') continue;

            const x = (pos[0] ?? 0) + (i % ax);
            const z = (pos[2] ?? 0) + (Math.floor(i / ax) % az);
            const y = (pos[1] ?? 0) + Math.floor(i / (ax * az));

            const color = getColor(name);
            const geo = new THREE.BoxGeometry(1, 1, 1);
            const mat = new THREE.MeshLambertMaterial({ color });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y, z);
            blockGroup.add(mesh);
            totalNonAir++;
          }
        }
      } else {
        // Sponge v3 format
        const width = entries.get('Width')?.value ?? 0;
        const height = entries.get('Height')?.value ?? 0;
        const length = entries.get('Length')?.value ?? 0;

        const blocks = entries.get('Blocks')?.value as Map<string, any>;
        const paletteList = blocks?.get('Palette')?.value as any[];
        const paletteNames: string[] = paletteList ? paletteList.map((e: any) => (typeof e === 'string' ? e : e.value ?? 'minecraft:air')) : [];
        const dataBytes = blocks?.get('Data')?.value as Uint8Array;

        const indices = dataBytes ? decodeVarInts(dataBytes) : [];
        const total = width * height * length;
        totalBlocks = total;

        for (let i = 0; i < Math.min(indices.length, total); i++) {
          const idx = indices[i];
          const name = idx >= 0 && idx < paletteNames.length ? paletteNames[idx] : 'minecraft:air';
          if (name === 'minecraft:air' || name === 'minecraft:cave_air' || name === 'minecraft:void_air') continue;

          const x = i % width;
          const z = Math.floor(i / width) % length;
          const y = Math.floor(i / (width * length));

          const color = getColor(name);
          const geo = new THREE.BoxGeometry(1, 1, 1);
          const mat = new THREE.MeshLambertMaterial({ color });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(x, y, z);
          blockGroup.add(mesh);
          totalNonAir++;
        }
      }

      scene.add(blockGroup);
      setStatus(`Loaded ${file.name}: ${totalBlocks} total, ${totalNonAir} non-air blocks`);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const undoStack = useRef<any[]>([]);
  const redoStack = useRef<any[]>([]);

  const saveUndoState = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const blockGroup = scene.getObjectByName('blocks');
    if (!blockGroup) return;
    const state = blockGroup.children.map((m: any) => ({
      position: [m.position.x, m.position.y, m.position.z],
      rotation: m.rotation.y,
    }));
    undoStack.current.push(state);
    redoStack.current = [];
  }, []);

  const handleTransform = useCallback((type: 'rotateY' | 'mirrorX' | 'mirrorZ' | 'delete') => {
    saveUndoState();
    const scene = sceneRef.current;
    if (!scene) return;
    const blockGroup = scene.getObjectByName('blocks');
    if (!blockGroup) return;

    const selected = Array.from(selectedRef.current);
    if (selected.length === 0) return;

    if (type === 'delete') {
      selected.forEach((mesh) => {
        blockGroup.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      selectedRef.current.clear();
      setSelectedCount(0);
      return;
    }

    // Compute centroid of selection
    const center = new THREE.Vector3();
    selected.forEach((m) => center.add(m.position));
    center.divideScalar(selected.length);

    selected.forEach((mesh) => {
      const pos = mesh.position.clone().sub(center);
      if (type === 'rotateY') {
        const x = pos.x, z = pos.z;
        pos.x = -z;
        pos.z = x;
      } else if (type === 'mirrorX') {
        pos.x = -pos.x;
      } else if (type === 'mirrorZ') {
        pos.z = -pos.z;
      }
      mesh.position.copy(pos.add(center));
      // Rotate the mesh itself for rotateY
      if (type === 'rotateY') {
        mesh.rotation.y += Math.PI / 2;
      }
    });
  }, []);

  // Keyboard shortcuts for transforms
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); return; }
      if (e.ctrlKey && e.key === 'z' && e.shiftKey) { e.preventDefault(); handleRedo(); return; }
      if (e.key === 'r' || e.key === 'R') handleTransform('rotateY');
      else if (e.key === 'x' || e.key === 'X') handleTransform('mirrorX');
      else if (e.key === 'z' || e.key === 'Z') handleTransform('mirrorZ');
      else if (e.key === 'Delete' || e.key === 'Backspace') handleTransform('delete');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleTransform]);

  const handleUndo = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene || undoStack.current.length === 0) return;
    const blockGroup = scene.getObjectByName('blocks');
    if (!blockGroup) return;

    // Save current state for redo
    const currentState = blockGroup.children.map((m: any) => ({
      position: [m.position.x, m.position.y, m.position.z],
      rotation: m.rotation.y,
    }));
    redoStack.current.push(currentState);

    // Restore previous state
    const prevState = undoStack.current.pop();
    blockGroup.children.forEach((mesh: any, i: number) => {
      if (prevState[i]) {
        mesh.position.set(prevState[i].position[0], prevState[i].position[1], prevState[i].position[2]);
        mesh.rotation.y = prevState[i].rotation;
      }
    });
    setSelectedCount(0);
    selectedRef.current.clear();
  }, []);

  const handleRedo = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene || redoStack.current.length === 0) return;
    const blockGroup = scene.getObjectByName('blocks');
    if (!blockGroup) return;

    // Save current state for undo
    const currentState = blockGroup.children.map((m: any) => ({
      position: [m.position.x, m.position.y, m.position.z],
      rotation: m.rotation.y,
    }));
    undoStack.current.push(currentState);

    // Restore redo state
    const redoState = redoStack.current.pop();
    blockGroup.children.forEach((mesh: any, i: number) => {
      if (redoState[i]) {
        mesh.position.set(redoState[i].position[0], redoState[i].position[1], redoState[i].position[2]);
        mesh.rotation.y = redoState[i].rotation;
      }
    });
    setSelectedCount(0);
    selectedRef.current.clear();
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        style={{
          padding: '12px',
          background: '#1e1e1e',
          color: '#eaeaea',
          borderBottom: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <label style={{ cursor: 'pointer', padding: '6px 12px', background: '#2a2a3a', borderRadius: '4px', border: '1px solid #555' }}>
          Open File
          <input type="file" accept=".schem,.litematic,.nbt" onChange={onFileInput} style={{ display: 'none' }} />
        </label>
        <span style={{ fontSize: '13px', opacity: 0.7 }}>{status}</span>
        {fileName && <span style={{ fontSize: '12px', opacity: 0.5 }}>{fileName}</span>}
        {selectedCount > 0 && <span style={{ fontSize: '12px', color: '#ffcc00' }}>Selected: {selectedCount}</span>}
        {selectedCount > 0 && (
          <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
            <button onClick={handleUndo} style={{ padding: '4px 8px', background: '#2a2a3a', border: '1px solid #555', color: '#eaeaea', cursor: 'pointer', fontSize: '12px' }}>Undo (Ctrl+Z)</button>
            <button onClick={handleRedo} style={{ padding: '4px 8px', background: '#2a2a3a', border: '1px solid #555', color: '#eaeaea', cursor: 'pointer', fontSize: '12px' }}>Redo (Ctrl+Shift+Z)</button>
            <button onClick={() => handleTransform('rotateY')} style={{ padding: '4px 8px', background: '#2a2a3a', border: '1px solid #555', color: '#eaeaea', cursor: 'pointer', fontSize: '12px' }}>Rotate (R)</button>
            <button onClick={() => handleTransform('mirrorX')} style={{ padding: '4px 8px', background: '#2a2a3a', border: '1px solid #555', color: '#eaeaea', cursor: 'pointer', fontSize: '12px' }}>Mirror X (X)</button>
            <button onClick={() => handleTransform('mirrorZ')} style={{ padding: '4px 8px', background: '#2a2a3a', border: '1px solid #555', color: '#eaeaea', cursor: 'pointer', fontSize: '12px' }}>Mirror Z (Z)</button>
            <button onClick={() => handleTransform('delete')} style={{ padding: '4px 8px', background: '#3a1a1a', border: '1px solid #555', color: '#ff6666', cursor: 'pointer', fontSize: '12px' }}>Delete (Del)</button>
          </div>
        )}
      </div>
      <div ref={containerRef} style={{ flex: 1 }} />
    </div>
  );
}

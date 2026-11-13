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
  const isSelecting = useRef(false);
  const isBoxSelecting = useRef(false);
  const boxStart = useRef<THREE.Vector2 | null>(null);
  const [status, setStatus] = useState('Drop a .schem or .litematic file here');
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [boxCorner1, setBoxCorner1] = useState<THREE.Vector3 | null>(null);
  const [boxCorner2, setBoxCorner2] = useState<THREE.Vector3 | null>(null);

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

      if (event.shiftKey) {
        // Box selection mode
        if (intersects.length > 0) {
          const hit = intersects[0].object as THREE.Mesh;
          if (!boxCorner1) {
            setBoxCorner1(hit.position.clone());
            setStatus('Click second corner for box selection');
          } else {
            setBoxCorner2(hit.position.clone());
            // Select all blocks in the box
            const min = new THREE.Vector3(
              Math.min(boxCorner1.x, hit.position.x),
              Math.min(boxCorner1.y, hit.position.y),
              Math.min(boxCorner1.z, hit.position.z),
            );
            const max = new THREE.Vector3(
              Math.max(boxCorner1.x, hit.position.x),
              Math.max(boxCorner1.y, hit.position.y),
              Math.max(boxCorner1.z, hit.position.z),
            );
            selectedRef.current.forEach((m) => {
              (m.material as THREE.MeshLambertMaterial).emissive.setHex(0x000000);
            });
            selectedRef.current.clear();
            blockGroup.children.forEach((mesh: any) => {
              const p = mesh.position;
              if (p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && p.z >= min.z && p.z <= max.z) {
                selectedRef.current.add(mesh);
                (mesh.material as THREE.MeshLambertMaterial).emissive.setHex(0x444400);
              }
            });
            setSelectedCount(selectedRef.current.size);
            setBoxCorner1(null);
            setBoxCorner2(null);
            setStatus(`Box selected ${selectedRef.current.size} blocks`);
          }
        }
        return;
      }

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

      const worker = new Worker(new URL('../workers/parse-worker.ts', import.meta.url), { type: 'module' });
      const result = await new Promise<any>((resolve, reject) => {
        worker.onmessage = (e) => {
          if (e.data.type === 'error') reject(new Error(e.data.message));
          else resolve(e.data);
        };
        worker.onerror = (e) => reject(new Error(e.message));
        worker.postMessage({ type: 'parse', bytes, fileName: file.name }, [bytes.buffer]);
      });
      worker.terminate();

      // Render blocks from worker result
      const scene = sceneRef.current;
      if (!scene) throw new Error('Scene not ready');

      const oldBlocks = scene.getObjectByName('blocks');
      if (oldBlocks) scene.remove(oldBlocks);
      const blockGroup = new THREE.Group();
      blockGroup.name = 'blocks';

      result.blocks.forEach((b: any) => {
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshLambertMaterial({ color: b.color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(b.x, b.y, b.z);
        blockGroup.add(mesh);
      });

      scene.add(blockGroup);
      setStatus(`Loaded ${file.name}: ${result.dimensions.width}×${result.dimensions.height}×${result.dimensions.length}, ${result.nonAirCount} blocks`);
      setFileName(file.name);
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
      if (e.key === 'f' || e.key === 'F') handleFill();
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

  const handleSave = useCallback(async () => {
    const scene = sceneRef.current;
    if (!scene) return;
    const blockGroup = scene.getObjectByName('blocks');
    if (!blockGroup) return;

    const blocks = blockGroup.children.map((m: any) => ({
      x: m.position.x,
      y: m.position.y,
      z: m.position.z,
      rotation: m.rotation.y,
    }));

    const data = JSON.stringify({ blocks, timestamp: Date.now() });
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('easyschemedit', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('projects')) {
            db.createObjectStore('projects', { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      const tx = db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      store.put({ id: 'current', data, savedAt: Date.now() });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      setStatus('Project saved to IndexedDB');
    } catch (err) {
      setStatus(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleLoad = useCallback(async () => {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('easyschemedit', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('projects')) {
            db.createObjectStore('projects', { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      const tx = db.transaction('projects', 'readonly');
      const store = tx.objectStore('projects');
      const req = store.get('current');
      const record = await new Promise<any>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      if (!record) {
        setStatus('No saved project found');
        return;
      }

      const parsed = JSON.parse(record.data);
      const scene = sceneRef.current;
      if (!scene) return;

      // Clear existing blocks
      const oldBlocks = scene.getObjectByName('blocks');
      if (oldBlocks) scene.remove(oldBlocks);
      const blockGroup = new THREE.Group();
      blockGroup.name = 'blocks';

      parsed.blocks.forEach((b: any) => {
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshLambertMaterial({ color: 0x7f7f7f });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(b.x, b.y, b.z);
        mesh.rotation.y = b.rotation;
        blockGroup.add(mesh);
      });

      scene.add(blockGroup);
      setStatus(`Loaded project: ${parsed.blocks.length} blocks`);
    } catch (err) {
      setStatus(`Load failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleFill = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const blockGroup = scene.getObjectByName('blocks');
    if (!blockGroup) return;

    const selected = Array.from(selectedRef.current);
    if (selected.length === 0) {
      setStatus('Select blocks first, then press F to fill');
      return;
    }

    saveUndoState();

    const blockName = prompt('Enter block name (e.g., minecraft:stone):', 'minecraft:stone');
    if (!blockName) return;

    const colorMap: Record<string, number> = {
      'minecraft:stone': 0x7f7f7f,
      'minecraft:dirt': 0x866043,
      'minecraft:grass_block': 0x5a8a3c,
      'minecraft:oak_planks': 0xb8945f,
      'minecraft:cobblestone': 0x7a7a7a,
    };
    const color = colorMap[blockName] ?? (Math.abs(blockName.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 0xffffff);

    selected.forEach((mesh) => {
      const mat = mesh.material as THREE.MeshLambertMaterial;
      mat.color.setHex(color);
    });

    setStatus(`Filled ${selected.length} blocks with ${blockName}`);
  }, [saveUndoState]);

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
        <button onClick={handleSave} style={{ padding: '6px 12px', background: '#1a3a1a', border: '1px solid #555', color: '#66ff66', cursor: 'pointer', fontSize: '12px', borderRadius: '4px' }}>Save</button>
        <button onClick={handleLoad} style={{ padding: '6px 12px', background: '#1a1a3a', border: '1px solid #555', color: '#6666ff', cursor: 'pointer', fontSize: '12px', borderRadius: '4px' }}>Load</button>
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
            <button onClick={handleFill} style={{ padding: '4px 8px', background: '#2a3a2a', border: '1px solid #555', color: '#66ff66', cursor: 'pointer', fontSize: '12px' }}>Fill (F)</button>
            <button onClick={() => handleTransform('delete')} style={{ padding: '4px 8px', background: '#3a1a1a', border: '1px solid #555', color: '#ff6666', cursor: 'pointer', fontSize: '12px' }}>Delete (Del)</button>
          </div>
        )}
      </div>
      <div ref={containerRef} style={{ flex: 1 }} />
    </div>
  );
}

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export default function EditorIsland() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const [status, setStatus] = useState('Drop a .schem or .litematic file here');
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 10000);
    camera.position.set(50, 50, 50);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

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

    return () => {
      window.removeEventListener('resize', onResize);
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
      const width = entries.get('Width')?.value ?? 0;
      const height = entries.get('Height')?.value ?? 0;
      const length = entries.get('Length')?.value ?? 0;

      // Parse palette
      const blocks = entries.get('Blocks')?.value as Map<string, any>;
      const paletteList = blocks?.get('Palette')?.value as any[];
      const paletteNames: string[] = paletteList ? paletteList.map((e: any) => e.value ?? 'minecraft:air') : [];
      const dataBytes = blocks?.get('Data')?.value as Uint8Array;

      // Decode VarInt data
      const indices: number[] = [];
      let byteOffset = 0;
      if (dataBytes) {
        while (byteOffset < dataBytes.length) {
          let result = 0;
          let bytesRead = 0;
          let byte: number;
          do {
            byte = dataBytes[byteOffset + bytesRead];
            result |= (byte & 0x7F) << (7 * bytesRead);
            bytesRead++;
          } while ((byte & 0x80) !== 0 && bytesRead < 5);
          indices.push(result);
          byteOffset += bytesRead;
        }
      }

      // Render blocks as colored cubes
      const scene = sceneRef.current;
      if (!scene) throw new Error('Scene not ready');

      // Clear previous blocks
      const oldBlocks = scene.getObjectByName('blocks');
      if (oldBlocks) scene.remove(oldBlocks);
      const blockGroup = new THREE.Group();
      blockGroup.name = 'blocks';

      // Color map for common blocks
      const colorMap: Record<string, number> = {
        'minecraft:stone': 0x7f7f7f,
        'minecraft:dirt': 0x866043,
        'minecraft:grass_block': 0x5a8a3c,
        'minecraft:oak_planks': 0xb8945f,
        'minecraft:cobblestone': 0x7a7a7a,
        'minecraft:air': 0x000000,
      };

      let blockCount = 0;
      const total = width * height * length;
      for (let i = 0; i < Math.min(indices.length, total); i++) {
        const idx = indices[i];
        const name = idx >= 0 && idx < paletteNames.length ? paletteNames[idx] : 'minecraft:air';
        if (name === 'minecraft:air' || name === 'minecraft:cave_air' || name === 'minecraft:void_air') continue;

        const x = i % width;
        const z = Math.floor(i / width) % length;
        const y = Math.floor(i / (width * length));

        const color = colorMap[name] ?? (Math.abs(name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 0xffffff);
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshLambertMaterial({ color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        blockGroup.add(mesh);
        blockCount++;
      }

      scene.add(blockGroup);
      setStatus(`Loaded ${file.name}: ${width}×${height}×${length}, ${blockCount} blocks, ${paletteNames.length} palette entries`);
      setFileName(file.name);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
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
      </div>
      <div ref={containerRef} style={{ flex: 1 }} />
    </div>
  );
}

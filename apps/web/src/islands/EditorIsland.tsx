'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export default function EditorIsland() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Drop a .schem or .litematic file here');
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

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

      const { detectFormat } = await import('@easyschemedit/formats');
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const format = detectFormat(bytes, ext);
      setStatus(`Loaded ${file.name} (${bytes.length} bytes, format: ${format.format.kind})`);
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

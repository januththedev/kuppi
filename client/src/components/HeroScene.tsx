// Kuppi hero backdrop: a slowly drifting constellation of "note shards" and
// glowing study-dust rendered with Three.js. Loaded lazily so the main bundle
// stays lean; paused whenever off-screen or hidden; renders a single static
// frame when the visitor prefers reduced motion.

import { useEffect, useRef } from "react";
import type * as THREE from "three";

const PALETTE = {
  violet: 0x5b35e8,
  violetSoft: 0x9d85f2,
  gold: 0xf6ce5a,
  coral: 0xe96f58,
  ink: 0x2b2344,
  paper: 0xfffdf9,
};

export default function HeroScene() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let frameId = 0;
    let running = true;
    const cleanupListeners: Array<() => void> = [];

    import("three").then((THREE) => {
      if (disposed) return;

      const width = host.clientWidth || 600;
      const height = host.clientHeight || 480;
      const compact = window.innerWidth < 820;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
      renderer.setSize(width, height);
      renderer.domElement.className = "hero-scene-canvas";
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
      camera.position.set(0, 0, 15);

      scene.add(new THREE.AmbientLight(0xffffff, 1.05));
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
      keyLight.position.set(5, 7, 9);
      scene.add(keyLight);
      const rimLight = new THREE.DirectionalLight(PALETTE.violetSoft, 1.1);
      rimLight.position.set(-7, -4, 5);
      scene.add(rimLight);

      const world = new THREE.Group();
      scene.add(world);

      // Thin slabs that read as note cards / book covers in 3D space.
      const shardGeometry = () => {
        const w = 0.65 + Math.random() * 1.05;
        const h = 0.85 + Math.random() * 1.25;
        return new THREE.BoxGeometry(w, h, 0.07);
      };

      const dustTexture = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext("2d")!;
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, "rgba(255,255,255,1)");
        gradient.addColorStop(0.35, "rgba(255,255,255,.55)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
      };

      // Note shards ---------------------------------------------------------
      const shardColors = [PALETTE.violet, PALETTE.gold, PALETTE.coral, PALETTE.paper, PALETTE.violetSoft, PALETTE.ink];
      const shardCount = compact ? 13 : 21;
      const shards: Array<{ mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>; speed: number; phase: number; spinX: number; spinY: number }> = [];
      for (let i = 0; i < shardCount; i++) {
        const geometry = shardGeometry();
        const colorIndex = Math.floor(Math.random() * shardColors.length);
        const material = new THREE.MeshStandardMaterial({
          color: shardColors[colorIndex],
          roughness: colorIndex === 3 ? 0.55 : 0.34,
          metalness: 0.06,
        });
        const mesh = new THREE.Mesh(geometry, material);
        // Bias shards toward the right-hand art column and keep them behind
        // the glass panels so the headline copy stays readable.
        mesh.position.set(
          (Math.random() - 0.3) * 12.5,
          (Math.random() - 0.5) * 8.5,
          -7 + Math.random() * 4.5,
        );
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, (Math.random() - 0.5) * 0.7);
        world.add(mesh);
        shards.push({
          mesh,
          speed: 0.35 + Math.random() * 0.55,
          phase: Math.random() * Math.PI * 2,
          spinX: (Math.random() - 0.5) * 0.0016,
          spinY: (Math.random() - 0.5) * 0.0022,
        });
      }

      // Study dust ----------------------------------------------------------
      const dustCount = compact ? 70 : 130;
      const positions = new Float32Array(dustCount * 3);
      for (let i = 0; i < dustCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 19;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 11;
        positions[i * 3 + 2] = -4 + Math.random() * 9;
      }
      const dustGeometry = new THREE.BufferGeometry();
      dustGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const dustMaterial = new THREE.PointsMaterial({
        size: 0.16,
        map: dustTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        color: PALETTE.violetSoft,
      });
      const dust = new THREE.Points(dustGeometry, dustMaterial);
      world.add(dust);

      // Pointer + scroll parallax -------------------------------------------
      const target = { x: 0, y: 0 };
      const current = { x: 0, y: 0 };
      let scrollOffset = 0;
      if (!reduceMotion && window.matchMedia("(hover: hover)").matches) {
        const onPointerMove = (event: PointerEvent) => {
          target.x = (event.clientX / window.innerWidth - 0.5) * 0.36;
          target.y = (event.clientY / window.innerHeight - 0.5) * 0.22;
        };
        window.addEventListener("pointermove", onPointerMove, { passive: true });
        cleanupListeners.push(() => window.removeEventListener("pointermove", onPointerMove));
      }
      if (!reduceMotion) {
        const onScroll = () => { scrollOffset = window.scrollY * 0.0022; };
        window.addEventListener("scroll", onScroll, { passive: true });
        cleanupListeners.push(() => window.removeEventListener("scroll", onScroll));
      }

      const clock = new THREE.Clock();
      const renderFrame = () => {
        const elapsed = clock.getElapsedTime();
        for (const shard of shards) {
          shard.mesh.position.y += Math.sin(elapsed * shard.speed + shard.phase) * 0.0032;
          shard.mesh.rotation.x += shard.spinX;
          shard.mesh.rotation.y += shard.spinY;
        }
        dust.rotation.y = elapsed * 0.02;
        current.x += (target.x - current.x) * 0.045;
        current.y += (target.y - current.y) * 0.045;
        world.rotation.y = current.x;
        world.rotation.x = current.y;
        world.position.y = scrollOffset % 2;
        renderer.render(scene, camera);
      };

      renderFrame();
      if (reduceMotion) {
        // Static composition: no loop, no timers.
      } else {
        const loop = () => {
          if (disposed) return;
          if (running) renderFrame();
          frameId = requestAnimationFrame(loop);
        };
        frameId = requestAnimationFrame(loop);
      }

      // Pause work while off-screen or when the tab is hidden ----------------
      const observer = new IntersectionObserver(([entry]) => { running = entry.isIntersecting; }, { threshold: 0.02 });
      observer.observe(host);
      const onVisibility = () => { running = !document.hidden; };
      document.addEventListener("visibilitychange", onVisibility);
      cleanupListeners.push(() => document.removeEventListener("visibilitychange", onVisibility));

      const resizeObserver = new ResizeObserver(() => {
        const nextWidth = host.clientWidth;
        const nextHeight = host.clientHeight;
        if (!nextWidth || !nextHeight) return;
        camera.aspect = nextWidth / nextHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(nextWidth, nextHeight);
      });
      resizeObserver.observe(host);

      cleanupListeners.push(() => {
        observer.disconnect();
        resizeObserver.disconnect();
        cancelAnimationFrame(frameId);
        world.traverse((node) => {
          const mesh = node as THREE.Mesh;
          mesh.geometry?.dispose?.();
          const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else material?.dispose?.();
        });
        dustGeometry.dispose();
        dustMaterial.map?.dispose();
        dustMaterial.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      });
    }).catch(() => {
      // WebGL unavailable: the hero keeps its CSS gradient fallback layers.
    });

    return () => {
      disposed = true;
      cleanupListeners.forEach((fn) => fn());
    };
  }, []);

  return <div ref={hostRef} className="hero-scene" aria-hidden="true" />;
}

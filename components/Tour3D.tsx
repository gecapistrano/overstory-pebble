"use client";
/* 3D tour viewer (three.js). Builds a simple walkable room from the listing's
   vibe tags (palette, light, style). Swap in a real Matterport / glTF scan via
   `modelUrl` when the brokerage has one. Drag to look around. */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Listing } from "@/lib/types";

const WALL: Record<string, number> = { artsy: 0xf6e3d3, gothic: 0xc9c4bf, minimalist: 0xf7f5f1, scandinavian: 0xf6f1ea, victorian: 0xe3ece0, craftsman: 0xefe6d2, industrial: 0xb7705c, colonial: 0xf3ead9, contemporary: 0xe9ecef, "modern farmhouse": 0xfbfaf7 };
const SOFA: Record<string, number> = { artsy: 0xf2c14e, gothic: 0x5c4a5a, minimalist: 0xc9a27a, scandinavian: 0xd2b48c, victorian: 0xe8b9b9, craftsman: 0xb5683c, industrial: 0x3a3a3e, colonial: 0x2f3b33, contemporary: 0x5e6670, "modern farmhouse": 0x8a8a84 };

export default function Tour3D({ listing, autoRotate = true, className = "" }: { listing: Listing; autoRotate?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const w = el.clientWidth, h = el.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.NoToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfbf2f2);
    const cam = new THREE.PerspectiveCamera(62, w / h, 0.1, 100);
    cam.position.set(2.6, 1.7, 3.2);
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.target.set(0, 0.9, 0);
    controls.enableDamping = true;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = (window as unknown as { __tourSpeed?: number }).__tourSpeed ?? 1.6;
    controls.maxDistance = 4.6;
    controls.minDistance = 1.2;
    controls.maxPolarAngle = Math.PI * 0.55;

    const wallC = WALL[listing.style] ?? 0xf3efe9;
    const mat = (c: number, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const box = (sx: number, sy: number, sz: number, c: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(c));
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      return m;
    };
    // room shell
    box(6, 0.05, 6, 0xc99b6d, 0, 0, 0); // floor
    box(6, 3, 0.05, wallC, 0, 1.5, -3);
    box(0.05, 3, 6, wallC, -3, 1.5, 0);
    box(0.05, 3, 6, wallC, 3, 1.5, 0).visible = true;
    // window (bright glow plane)
    const winW = listing.light > 0.8 ? 2.6 : 1.4;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(winW, 1.7), new THREE.MeshBasicMaterial({ color: 0xfff6e0 }));
    win.position.set(0.4, 1.6, -2.97);
    scene.add(win);
    box(winW + 0.1, 0.08, 0.1, 0x2a2a2a, 0.4, 0.74, -2.95);
    box(0.06, 1.7, 0.08, 0x2a2a2a, 0.4, 1.6, -2.95);
    // rug, sofa, table, lamp, plant, art
    box(2.6, 0.02, 1.8, listing.style === "artsy" ? 0x3b5ba9 : 0xe8d9c8, 0, 0.03, -0.6);
    const sofa = SOFA[listing.style] ?? 0x9a8f8b;
    box(2.2, 0.45, 0.9, sofa, 0, 0.3, -1.9);
    box(2.2, 0.6, 0.25, sofa, 0, 0.75, -2.3);
    box(0.25, 0.6, 0.9, sofa, -1.1, 0.45, -1.9);
    box(0.25, 0.6, 0.9, sofa, 1.1, 0.45, -1.9);
    box(1.0, 0.06, 0.6, 0x6b4a33, 0, 0.42, -0.6);
    [[-0.45, -0.85], [0.45, -0.85], [-0.45, -0.35], [0.45, -0.35]].forEach(([x, z]) => box(0.05, 0.4, 0.05, 0x6b4a33, x, 0.2, z));
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.45, 20), mat(0xc9734f));
    pot.position.set(-2.4, 0.23, -2.4);
    scene.add(pot);
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), mat(0x5e9a62));
    leaves.position.set(-2.4, 0.95, -2.4);
    leaves.castShadow = true;
    scene.add(leaves);
    const arts = listing.style === "artsy" ? [0xe07a55, 0x2f7f7f, 0xf2c14e] : [0xb08455];
    arts.forEach((c, i) => box(0.6, 0.75, 0.04, c, -2.97 + 0.03, 1.7, -1.2 + i * 0.85).rotateY(Math.PI / 2));
    box(0.05, 1.5, 0.05, 0x222222, 2.4, 0.75, -2.4);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.35, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xf2c14e, side: THREE.DoubleSide, emissive: 0x7a5a10 }));
    shade.position.set(2.4, 1.55, -2.4);
    scene.add(shade);

    // light: brighter rooms get a strong sun
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd9c3a3, 1.6 + listing.light * 0.8));
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const sun = new THREE.DirectionalLight(0xfff1d6, 0.6 + listing.light * 1.6);
    sun.position.set(1, 4, -6);
    sun.castShadow = true;
    scene.add(sun);
    const lamp = new THREE.PointLight(0xffd9a0, listing.ambience.includes("cozy") ? 2.5 : 1, 5);
    lamp.position.set(2.4, 1.5, -2.2);
    scene.add(lamp);

    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, cam);
      raf = requestAnimationFrame(loop);
    };
    loop();
    const onResize = () => {
      const W = el.clientWidth, Hh = el.clientHeight;
      renderer.setSize(W, Hh);
      cam.aspect = W / Hh;
      cam.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      el.innerHTML = "";
    };
  }, [listing, autoRotate]);
  return <div ref={ref} className={className} />;
}

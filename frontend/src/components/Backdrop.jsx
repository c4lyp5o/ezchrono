import { useEffect, useRef } from "react";
import * as THREE from "three";

// A slow field of cron "ticks" drifting behind the sign-in card. It runs only
// on this screen, stops when hidden, and renders one still frame for reduced motion.
export default function Backdrop() {
	const ref = useRef(null);

	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return undefined;
		let renderer;
		try {
			renderer = new THREE.WebGLRenderer({
				canvas,
				antialias: true,
				alpha: true,
			});
		} catch {
			return undefined; // no WebGL: the CSS background stands alone
		}
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
		camera.position.z = 14;

		const count = 180;
		const geometry = new THREE.SphereGeometry(0.06, 8, 8);
		const material = new THREE.MeshBasicMaterial({ color: 0x34d399 });
		const mesh = new THREE.InstancedMesh(geometry, material, count);
		const seeds = [];
		const dummy = new THREE.Object3D();
		for (let i = 0; i < count; i++) {
			seeds.push({
				x: (Math.random() - 0.5) * 30,
				y: (Math.random() - 0.5) * 18,
				z: -Math.random() * 20,
				speed: 0.2 + Math.random() * 0.6,
			});
		}
		scene.add(mesh);

		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
		const place = (t) => {
			for (let i = 0; i < count; i++) {
				const s = seeds[i];
				dummy.position.set(s.x, s.y + ((t * s.speed) % 18) - 9, s.z);
				dummy.updateMatrix();
				mesh.setMatrixAt(i, dummy.matrix);
			}
			mesh.instanceMatrix.needsUpdate = true;
			renderer.render(scene, camera);
		};

		const resize = () => {
			const w = canvas.clientWidth;
			const h = canvas.clientHeight;
			renderer.setSize(w, h, false);
			camera.aspect = w / Math.max(h, 1);
			camera.updateProjectionMatrix();
		};
		resize();

		let raf = 0;
		let start = performance.now();
		const loop = (now) => {
			place((now - start) / 1000);
			raf = requestAnimationFrame(loop);
		};
		const run = () => {
			cancelAnimationFrame(raf);
			if (reduced.matches) {
				place(0);
			} else {
				raf = requestAnimationFrame(loop);
			}
		};
		const onVisibility = () => {
			if (document.hidden) cancelAnimationFrame(raf);
			else {
				start = performance.now();
				run();
			}
		};

		window.addEventListener("resize", resize);
		document.addEventListener("visibilitychange", onVisibility);
		reduced.addEventListener("change", run);
		run();

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("resize", resize);
			document.removeEventListener("visibilitychange", onVisibility);
			reduced.removeEventListener("change", run);
			geometry.dispose();
			material.dispose();
			mesh.dispose();
			renderer.dispose();
		};
	}, []);

	return <canvas ref={ref} className="backdrop" />;
}

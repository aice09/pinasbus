import * as THREE from 'three';
import type { CustomLayerInterface, Map as MlMap } from 'maplibre-gl';
import { MercatorCoordinate } from 'maplibre-gl';
import type { Livery } from '@/lib/livery';

/** Model space: x east, y north (the bus faces +y), z up; one unit is the bus length. */
function model(l: Livery) {
  const g = new THREE.Group();
  const mat = (color: string) => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  const box = (w: number, d: number, h: number, color: string, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), mat(color)); m.position.set(x, y, z); g.add(m);
  };
  box(0.32, 1, 0.26, l.body, 0, 0, 0.19);        // lower body
  box(0.33, 0.96, 0.03, l.trim, 0, 0, 0.3);       // belt stripe
  box(0.31, 0.94, 0.12, '#24343b', 0, 0, 0.38);   // window band
  box(0.33, 1, 0.04, '#f7f7f4', 0, 0, 0.46);      // roof
  box(0.26, 0.02, 0.1, '#24343b', 0, 0.505, 0.38); // windshield
  box(0.22, 0.02, 0.05, '#141310', 0, 0.505, 0.45); // destination sign
  for (const sx of [-1, 1]) for (const sy of [-0.32, 0.3]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16), mat('#1c1e1d'));
    w.rotation.z = Math.PI / 2; w.position.set(sx * 0.16, sy, 0.07); g.add(w);
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
  shadow.scale.set(0.5, 1.15, 1); shadow.position.z = 0.002; g.add(shadow);
  return g;
}

/** A cartoon 3D bus drawn into the map with three.js. Its size follows the zoom so it stays about 70 px long. */
export function busLayer(livery: Livery) {
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(0.6, -0.8, 1.2); scene.add(sun);
  scene.add(model(livery));
  let renderer: THREE.WebGLRenderer | null = null, map: MlMap | null = null;
  const pose = { lngLat: [0, 0] as [number, number], bearing: 0 };
  const layer: CustomLayerInterface = {
    id: 'journey-bus', type: 'custom', renderingMode: '3d',
    onAdd(m, gl) { map = m; renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true }); renderer.autoClear = false; },
    onRemove() { renderer?.dispose(); },
    render(_gl, args) {
      if (!renderer || !map) return;
      const mc = MercatorCoordinate.fromLngLat(pose.lngLat, 0);
      const metresPerPx = (40075016.686 * Math.cos((pose.lngLat[1] * Math.PI) / 180)) / (512 * 2 ** map.getZoom());
      const s = mc.meterInMercatorCoordinateUnits() * metresPerPx * 70;
      const world = new THREE.Matrix4().makeTranslation(mc.x, mc.y, mc.z)
        .scale(new THREE.Vector3(s, -s, s))
        .multiply(new THREE.Matrix4().makeRotationZ((-pose.bearing * Math.PI) / 180));
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(world);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };
  return { layer, pose };
}

'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Seat } from '@/lib/layouts';

type Props = { layout: Seat[]; taken: Set<string>; selected: string[]; onToggle: (id: string) => void; restroom: boolean };

const C = { free: '#f3f5ef', sel: '#c8322b', taken: '#8f958b', hover: '#2e6b52', body: '#1f4d3a', floor: '#cfd5c8', wheel: '#1d1f1e', glass: '#9cc3d5' };
const COL_W = 0.62;

function Controls({ target, maxDistance }: { target: THREE.Vector3; maxDistance: number }) {
  const { camera, gl } = useThree();
  const ref = useRef<OrbitControls | null>(null);
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.target.copy(target);
    c.enableDamping = true;
    c.enablePan = false;
    c.minDistance = 4;
    c.maxDistance = maxDistance;
    c.maxPolarAngle = Math.PI / 2.1;
    ref.current = c;
    return () => c.dispose();
  }, [camera, gl, target, maxDistance]);
  useFrame(() => ref.current?.update());
  return null;
}

function dims(layout: Seat[]) {
  const sleeper = layout[0].berth;
  const cols = Math.max(...layout.map((s) => s.x)) + 1;
  const rows = Math.max(...layout.map((s) => s.row)) + 1;
  const pitch = sleeper ? 1.95 : rows > 10 ? 0.74 : 0.9;
  const width = cols * COL_W + 0.5;
  const front = 1.5; // driver's area
  const length = front + rows * pitch + (sleeper ? 0.3 : 0.6);
  const height = sleeper ? 2.5 : 2.0;
  return { sleeper, cols, rows, pitch, width, front, length, height };
}

const labelCache = new Map<string, THREE.CanvasTexture>();
function label(text: string, dark: boolean) {
  const key = text + dark;
  let t = labelCache.get(key);
  if (!t) {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 64;
    const g = cv.getContext('2d')!;
    g.fillStyle = dark ? '#ffffff' : '#1a1f1c';
    g.font = 'bold 44px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 64, 34);
    t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4;
    labelCache.set(key, t);
  }
  return t;
}

function SeatMesh({ seat, pos, state, hovered, onHover, onToggle }: {
  seat: Seat; pos: [number, number, number]; state: 'free' | 'sel' | 'taken'; hovered: boolean;
  onHover: (id: string | null) => void; onToggle: (id: string) => void;
}) {
  const color = state === 'taken' ? C.taken : state === 'sel' ? C.sel : hovered ? C.hover : C.free;
  const events = state === 'taken' ? {} : {
    onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onHover(seat.id); document.body.style.cursor = 'pointer'; },
    onPointerOut: () => { onHover(null); document.body.style.cursor = ''; },
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onToggle(seat.id); },
  };
  const tex = label(seat.id, state !== 'free' || hovered);
  if (seat.berth) {
    return (
      <group position={pos} {...events}>
        <mesh castShadow receiveShadow><boxGeometry args={[0.56, 0.14, 1.7]} /><meshStandardMaterial color={color} roughness={0.7} /></mesh>
        <mesh position={[0, 0.1, -0.68]} castShadow><boxGeometry args={[0.44, 0.08, 0.26]} /><meshStandardMaterial color="#ffffff" roughness={0.9} /></mesh>
        <mesh position={[0, 0.25, -0.86]}><boxGeometry args={[0.6, 0.5, 0.04]} /><meshStandardMaterial color={C.body} roughness={0.6} /></mesh>
        <mesh position={[0, 0.076, 0.15]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[0.44, 0.22]} /><meshBasicMaterial map={tex} transparent /></mesh>
      </group>
    );
  }
  return (
    <group position={pos} {...events}>
      <mesh castShadow receiveShadow><boxGeometry args={[0.5, 0.12, 0.48]} /><meshStandardMaterial color={color} roughness={0.7} /></mesh>
      <mesh position={[0, 0.32, 0.24]} rotation={[-0.18, 0, 0]} castShadow><boxGeometry args={[0.5, 0.6, 0.1]} /><meshStandardMaterial color={color} roughness={0.7} /></mesh>
      <mesh position={[0, 0.065, -0.02]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[0.4, 0.2]} /><meshBasicMaterial map={tex} transparent /></mesh>
    </group>
  );
}

function Bus({ layout, taken, selected, onToggle, restroom, lift, hover, setHover }: Props & { lift: boolean; hover: string | null; setHover: (id: string | null) => void }) {
  const { sleeper, cols, rows, pitch, width, front, length, height } = dims(layout);
  const z0 = -length / 2 + front + pitch / 2;
  const upper = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    if (!upper.current) return;
    const goal = lift ? 1.6 : 0;
    upper.current.position.y += (goal - upper.current.position.y) * Math.min(1, dt * 6);
  });

  const place = (s: Seat): [number, number, number] => [
    (s.x - (cols - 1) / 2) * COL_W * (sleeper ? 1.2 : 1),
    s.deck ? 1.35 : 0.4,
    z0 + s.row * pitch,
  ];
  const stateOf = (id: string) => (taken.has(id) ? 'taken' : selected.includes(id) ? 'sel' : 'free') as 'free' | 'sel' | 'taken';
  const render = (s: Seat) => <SeatMesh key={s.id} seat={s} pos={place(s)} state={stateOf(s.id)} hovered={hover === s.id} onHover={setHover} onToggle={onToggle} />;

  const shell = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, length)), [width, height, length]);

  return (
    <group>
      {/* floor */}
      <mesh position={[0, 0.1, 0]} receiveShadow><boxGeometry args={[width, 0.2, length]} /><meshStandardMaterial color={C.floor} /></mesh>
      {/* body: low side walls + outline, open top so the seats stay visible */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * width) / 2, 0.55, 0]}><boxGeometry args={[0.05, 0.7, length]} /><meshStandardMaterial color={C.body} /></mesh>
      ))}
      <mesh position={[0, 0.55, length / 2]}><boxGeometry args={[width, 0.7, 0.05]} /><meshStandardMaterial color={C.body} /></mesh>
      <lineSegments geometry={shell} position={[0, height / 2 + 0.2, 0]}><lineBasicMaterial color={C.body} transparent opacity={0.45} /></lineSegments>
      {/* windshield */}
      <mesh position={[0, height / 2 + 0.45, -length / 2]}><planeGeometry args={[width, height - 0.5]} /><meshStandardMaterial color={C.glass} transparent opacity={0.35} side={THREE.DoubleSide} /></mesh>
      {/* driver (Philippine buses are left-hand drive) */}
      <group position={[-width / 2 + 0.45, 0.4, -length / 2 + 0.75]}>
        <mesh castShadow><boxGeometry args={[0.45, 0.12, 0.45]} /><meshStandardMaterial color="#3a3f3b" /></mesh>
        <mesh position={[0, 0.3, 0.22]}><boxGeometry args={[0.45, 0.55, 0.08]} /><meshStandardMaterial color="#3a3f3b" /></mesh>
        <mesh position={[0, 0.55, -0.4]} rotation={[-1.1, 0, 0]}><torusGeometry args={[0.18, 0.03, 8, 24]} /><meshStandardMaterial color="#222" /></mesh>
      </group>
      {/* door, front right */}
      <mesh position={[width / 2 + 0.01, 0.9, -length / 2 + 0.75]}><boxGeometry args={[0.03, 1.4, 0.8]} /><meshStandardMaterial color={C.glass} transparent opacity={0.5} /></mesh>
      {/* wheels */}
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <mesh key={`${sx}${sz}`} position={[(sx * width) / 2, 0, sz * (length / 2 - 1.1)]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.38, 0.38, 0.28, 24]} /><meshStandardMaterial color={C.wheel} roughness={0.9} />
        </mesh>
      )))}
      {restroom && (
        <mesh position={[sleeper ? place({ id: 'cr', x: cols - 1, row: rows - 1, deck: 0, berth: true })[0] : (width / 2 - 0.4), 0.9, length / 2 - (sleeper ? pitch / 2 + 0.3 : 0.4)]}>
          <boxGeometry args={[sleeper ? 0.7 : 0.7, 1.4, sleeper ? 1.6 : 0.7]} /><meshStandardMaterial color="#d9ddd3" transparent opacity={0.8} />
        </mesh>
      )}
      {layout.filter((s) => s.deck === 0).map(render)}
      <group ref={upper}>{layout.filter((s) => s.deck === 1).map(render)}</group>
    </group>
  );
}

export default function Bus3D(props: Props) {
  const sleeper = props.layout[0].berth;
  const [lift, setLift] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const target = useMemo(() => new THREE.Vector3(0, 0.8, 0), []);
  const { length } = dims(props.layout);
  const d = length * 1.05 + 3; // far enough to frame the whole bus at fov 40
  const camPos: [number, number, number] = [d * 0.55, d * 0.62, d * 0.55];
  return (
    <div className="canvas3d">
      <Canvas shadows dpr={[1, 2]} camera={{ position: camPos, fov: 40 }} aria-hidden="true">
        <ambientLight intensity={0.75} />
        <directionalLight position={[5, 9, 4]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <hemisphereLight args={['#ffffff', '#87a08f', 0.5]} />
        <Bus {...props} lift={lift} hover={hover} setHover={setHover} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.38, 0]} receiveShadow><circleGeometry args={[14, 48]} /><shadowMaterial opacity={0.18} /></mesh>
        <Controls target={target} maxDistance={d * 1.6} />
      </Canvas>
      {hover && <span className="hover-tag">{sleeper ? 'Berth' : 'Seat'} {hover}</span>}
      <span className="hint">Drag to turn, scroll or pinch to zoom, tap a seat to pick it.</span>
      {sleeper && (
        <button type="button" className="btn quiet" style={{ position: 'absolute', right: 12, bottom: 10, minHeight: 36, background: 'var(--surface)' }} aria-pressed={lift} onClick={() => setLift((v) => !v)}>
          {lift ? 'Lower the upper deck' : 'Lift the upper deck'}
        </button>
      )}
    </div>
  );
}

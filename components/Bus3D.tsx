'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PASSENGER_KINDS, seatName, type Seat } from '@/lib/layouts';
import type { SeatViewProps } from './SeatPlan';
import { DEFAULT_LIVERY, type Livery } from '@/lib/livery';

type Props = SeatViewProps & { livery?: Livery };

const KIND: Record<string, string> = { pwd: '#2f6fb3', senior: '#b7791f', priority: '#6b4fa0', reserved: '#8f958b', driver: '#3a3f3b', conductor: '#3a3f3b', crew: '#3a3f3b', unavailable: '#6d726a' };
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

function Tag({ text, position, scale = 1 }: { text: string; position: [number, number, number]; scale?: number }) {
  const tex = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 128;
    const g = cv.getContext('2d')!;
    g.fillStyle = 'rgba(26,31,28,0.88)';
    g.beginPath(); g.roundRect(4, 4, 504, 120, 28); g.fill();
    g.fillStyle = '#ffffff'; g.font = 'bold 60px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 68);
    return new THREE.CanvasTexture(cv);
  }, [text]);
  return <sprite position={position} scale={[3.4 * scale, 0.85 * scale, 1]}><spriteMaterial map={tex} depthTest={false} /></sprite>;
}

function SeatMesh({ seat, pos, state, hovered, onHover, onToggle }: {
  seat: Seat; pos: [number, number, number]; state: 'free' | 'sel' | 'taken' | 'kind' | 'crew'; hovered: boolean;
  onHover: (id: string | null) => void; onToggle: (id: string) => void;
}) {
  const fixed = state === 'crew';
  const color = state === 'taken' ? C.taken : state === 'sel' ? C.sel : hovered ? C.hover : fixed ? KIND[seat.kind] : state === 'kind' ? KIND[seat.kind] : C.free;
  const events = state === 'taken' || fixed ? {} : {
    onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onHover(seat.id); document.body.style.cursor = 'pointer'; },
    onPointerOut: () => { onHover(null); document.body.style.cursor = ''; },
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onToggle(seat.id); },
  };
  const tex = label(fixed ? (seat.kind === 'driver' ? 'DRV' : 'CRW') : seat.id, state !== 'free' || hovered);
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

const GLASS = { color: '#a9cfe0', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false } as const;
const PILLAR = '#1b211e';

/** Body shell in the company's colours: skirt to the belt line, a stripe, glass windows between pillars, open roof. */
function Shell({ width, length, height, pitch, rows, front, sleeper, livery }: ReturnType<typeof dims> & { livery: Livery }) {
  const belt = sleeper ? 0.72 : 0.85;
  const top = height + 0.2;
  const band = top - belt - 0.1;
  const z0 = -length / 2 + front;
  // One pane per seat row along each side, plus the driver's window at the front.
  const panes = [{ z: -length / 2 + front / 2 + 0.05, len: front - 0.25 }, ...Array.from({ length: rows }, (_, r) => ({ z: z0 + (r + 0.5) * pitch, len: pitch - 0.1 }))];
  const paint = <meshStandardMaterial color={livery.body} roughness={0.45} metalness={0.15} />;
  const trim = <meshStandardMaterial color={livery.trim} roughness={0.4} metalness={0.2} />;
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side} position={[(side * width) / 2, 0, 0]}>
          <mesh position={[0, belt / 2 - 0.02, 0]} castShadow><boxGeometry args={[0.06, belt + 0.06, length]} />{paint}</mesh>
          <mesh position={[side * 0.005, belt, 0]}><boxGeometry args={[0.07, 0.1, length + 0.01]} />{trim}</mesh>
          {/* a second, thinner stripe low on the skirt */}
          <mesh position={[side * 0.005, 0.22, 0]}><boxGeometry args={[0.07, 0.05, length * 0.9]} />{trim}</mesh>
          {panes.map((p, i) => (
            <group key={i}>
              <mesh position={[0, belt + 0.05 + band / 2, p.z]}><boxGeometry args={[0.02, band, p.len]} /><meshStandardMaterial {...GLASS} /></mesh>
              <mesh position={[0, belt + 0.05 + band / 2, p.z - p.len / 2 - 0.05]}><boxGeometry args={[0.07, band, 0.1]} /><meshStandardMaterial color={PILLAR} roughness={0.5} /></mesh>
            </group>
          ))}
          <mesh position={[0, belt + 0.05 + band / 2, length / 2 - 0.05]}><boxGeometry args={[0.07, band, 0.1]} /><meshStandardMaterial color={PILLAR} /></mesh>
          {sleeper && <mesh position={[0, 1.3, 0]}><boxGeometry args={[0.075, 0.08, length]} />{trim}</mesh>}
          {/* roof rail */}
          <mesh position={[0, top, 0]}><boxGeometry args={[0.12, 0.08, length]} />{paint}</mesh>
        </group>
      ))}
      {/* front face: bumper, headlights, windshield, destination sign */}
      <group position={[0, 0, -length / 2]}>
        <mesh position={[0, belt / 2 - 0.02, 0]} castShadow><boxGeometry args={[width + 0.06, belt + 0.06, 0.08]} />{paint}</mesh>
        <mesh position={[0, 0.02, -0.02]}><boxGeometry args={[width + 0.1, 0.16, 0.1]} /><meshStandardMaterial color="#2a2f2c" roughness={0.8} /></mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (width / 2 - 0.22), 0.32, -0.05]}><boxGeometry args={[0.28, 0.1, 0.03]} /><meshStandardMaterial color="#fffbe8" emissive="#fff3c4" emissiveIntensity={0.8} /></mesh>
        ))}
        <mesh position={[0, belt + 0.05 + (band - 0.3) / 2, 0.02]} rotation={[-0.08, 0, 0]}><boxGeometry args={[width, band - 0.3, 0.02]} /><meshStandardMaterial {...GLASS} opacity={0.18} /></mesh>
        <mesh position={[0, top - 0.14, 0]}><boxGeometry args={[width * 0.78, 0.2, 0.06]} /><meshStandardMaterial color="#141310" emissive="#ffb000" emissiveIntensity={0.25} /></mesh>
        <mesh position={[0, top, 0]}><boxGeometry args={[width + 0.12, 0.08, 0.12]} />{paint}</mesh>
      </group>
      {/* rear: panel, window, tail lights */}
      <group position={[0, 0, length / 2]}>
        <mesh position={[0, belt / 2 - 0.02, 0]} castShadow><boxGeometry args={[width + 0.06, belt + 0.06, 0.08]} />{paint}</mesh>
        <mesh position={[0, belt + 0.05 + band / 2, 0]}><boxGeometry args={[width, band, 0.02]} /><meshStandardMaterial {...GLASS} /></mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (width / 2 - 0.15), 0.45, 0.05]}><boxGeometry args={[0.12, 0.3, 0.03]} /><meshStandardMaterial color="#b3121b" emissive="#7a0a10" emissiveIntensity={0.6} /></mesh>
        ))}
        <mesh position={[0, top, 0]}><boxGeometry args={[width + 0.12, 0.08, 0.12]} />{paint}</mesh>
      </group>
      {/* door, front right, darker glass from the step to the roof */}
      <mesh position={[width / 2 + 0.04, (top + 0.15) / 2, -length / 2 + front - 0.45]}><boxGeometry args={[0.03, top - 0.2, 0.75]} /><meshStandardMaterial color="#2b3a40" transparent opacity={0.7} roughness={0.1} /></mesh>
      {/* wheels with hubs, in dark arches */}
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <group key={`${sx}${sz}`} position={[(sx * width) / 2, 0, sz * (length / 2 - 1.1)]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.4, 0.4, 0.3, 32]} /><meshStandardMaterial color="#1d1f1e" roughness={0.95} /></mesh>
          <mesh position={[sx * 0.16, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.22, 0.22, 0.02, 24]} /><meshStandardMaterial color="#c9ced1" metalness={0.8} roughness={0.3} /></mesh>
          <mesh position={[sx * 0.01, 0.12, 0]}><boxGeometry args={[0.07, 0.3, 1.0]} /><meshStandardMaterial color="#202422" /></mesh>
        </group>
      )))}
    </group>
  );
}

/** A metal ladder from the aisle floor to the upper deck, at the front of the aisle. */
function Ladder({ x, z, to }: { x: number; z: number; to: number }) {
  const metal = <meshStandardMaterial color="#b9c0c4" metalness={0.85} roughness={0.3} />;
  const h = to - 0.2;
  return (
    <group position={[x, 0.2, z]} rotation={[0.18, 0, 0]}>
      {[-0.17, 0.17].map((dx) => <mesh key={dx} position={[dx, h / 2, 0]}><cylinderGeometry args={[0.025, 0.025, h, 10]} />{metal}</mesh>)}
      {Array.from({ length: 4 }, (_, i) => (
        <mesh key={i} position={[0, ((i + 1) * h) / 5, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.02, 0.02, 0.34, 8]} />{metal}</mesh>
      ))}
    </group>
  );
}

function Bus({ layout, taken, released = new Set(), selected, onToggle, restroom, lift, hover, setHover, livery }: Props & { lift: boolean; hover: string | null; setHover: (id: string | null) => void; livery: Livery }) {
  const d = dims(layout);
  const { sleeper, cols, rows, pitch, width, front, length } = d;
  const z0 = -length / 2 + front + pitch / 2;
  const upper = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    if (!upper.current) return;
    const goal = lift ? 1.6 : 0;
    upper.current.position.y += (goal - upper.current.position.y) * Math.min(1, dt * 6);
  });

  const xOf = (x: number) => (x - (cols - 1) / 2) * COL_W * (sleeper ? 1.2 : 1);
  const place = (s: Seat): [number, number, number] => [xOf(s.x), s.deck ? 1.35 : 0.4, z0 + s.row * pitch];
  const stateOf = (s: Seat) => (!PASSENGER_KINDS.includes(s.kind) ? 'crew' : taken.has(s.id) ? 'taken' : selected.includes(s.id) ? 'sel'
    : s.kind !== 'regular' && !released.has(s.id) ? 'kind' : 'free') as 'free' | 'sel' | 'taken' | 'kind' | 'crew';
  const render = (s: Seat) => <SeatMesh key={s.id} seat={s} pos={place(s)} state={stateOf(s)} hovered={hover === s.id} onHover={setHover} onToggle={onToggle} />;
  // The aisle is the first column no seat uses.
  const used = new Set(layout.map((s) => s.x));
  const aisle = Array.from({ length: cols }, (_, i) => i).find((i) => !used.has(i));
  const crPos = (y: number): [number, number, number] => [sleeper ? xOf(cols - 1) : width / 2 - 0.4, y, length / 2 - (sleeper ? pitch / 2 + 0.3 : 0.4)];

  return (
    <group>
      <mesh position={[0, 0.1, 0]} receiveShadow><boxGeometry args={[width, 0.2, length]} /><meshStandardMaterial color={C.floor} /></mesh>
      <Shell {...d} livery={livery} />
      {sleeper && aisle !== undefined && <Ladder x={xOf(aisle)} z={z0 - pitch / 2 + 0.25} to={1.35} />}
      {restroom && (
        <mesh position={crPos(0.9)}><boxGeometry args={[0.7, 1.4, sleeper ? 1.6 : 0.7]} /><meshStandardMaterial color="#d9ddd3" transparent opacity={0.85} /></mesh>
      )}
      {restroom && <Tag text="CR" scale={0.5} position={crPos(1.9)} />}
      <Tag text="FRONT" scale={0.7} position={[0, d.height + 0.75, -length / 2]} />
      {layout.filter((s) => s.deck === 0).map(render)}
      {sleeper && <Tag text="Lower deck (L)" position={[-width / 2 - 2, 0.5, z0 + pitch]} />}
      <group ref={upper}>
        {layout.filter((s) => s.deck === 1).map(render)}
        {sleeper && <Tag text="Upper deck (U)" position={[-width / 2 - 2, 1.6, z0]} />}
      </group>
    </group>
  );
}

export default function Bus3D(props: Props) {
  const sleeper = props.layout[0].berth;
  const [lift, setLift] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const target = useMemo(() => new THREE.Vector3(0, 0.8, 0), []);
  const { length } = dims(props.layout);
  // Far enough to frame the whole bus at fov 40; portrait phones need more distance for the same width.
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;
  const d = (length * 1.05 + 3) * (narrow ? 1.6 : 1);
  const camPos: [number, number, number] = [d * 0.55, d * 0.62, d * 0.55];
  return (
    <div className="canvas3d">
      <Canvas shadows dpr={[1, 2]} camera={{ position: camPos, fov: 40 }} aria-hidden="true">
        <ambientLight intensity={0.75} />
        <directionalLight position={[5, 9, 4]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <hemisphereLight args={['#ffffff', '#87a08f', 0.5]} />
        <Bus {...props} livery={props.livery ?? DEFAULT_LIVERY} lift={lift} hover={hover} setHover={setHover} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.38, 0]} receiveShadow><circleGeometry args={[14, 48]} /><shadowMaterial opacity={0.18} /></mesh>
        <Controls target={target} maxDistance={d * 1.6} />
      </Canvas>
      {props.livery && <span className="livery-note">Colours resemble this company’s buses; not an official design.</span>}
      {hover && <span className="hover-tag">{seatName(hover)}</span>}
      <span className="hint">Drag to turn, scroll or pinch to zoom, tap a seat to pick it.</span>
      {sleeper && (
        <button type="button" className="btn quiet" style={{ position: 'absolute', right: 12, bottom: 10, minHeight: 36, background: 'var(--surface)' }} aria-pressed={lift} onClick={() => setLift((v) => !v)}>
          {lift ? 'Lower the upper deck' : 'Lift the upper deck'}
        </button>
      )}
    </div>
  );
}

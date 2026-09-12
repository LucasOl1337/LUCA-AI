import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getReplayFrame, toLocalCoordinate, type LabCase, type LabSite, type LabPolygon } from '../../../shared/lab-telemetry.js';
import { createLabTractor } from './createLabTractor';
import { createSompoTruckModel, SOMPO_TRUCK_PIVOT_Y } from '../sompo/createSompoTruckModel';
import { parseLabTerrain, createTerrainSampler, type LabTerrain } from '../../../shared/lab-terrain.js';

export type LabCameraMode = 'free' | 'top' | 'follow';

interface LabSceneProps {
  labCase: LabCase | null;
  site?: LabSite | null;
  elapsedMs: number;
  cameraMode: LabCameraMode;
  selectedEventId?: string | null;
  onSelectEvent?: (eventId: string) => void;
  showDetails?: boolean;
}

type Point = { x: number; z: number };
type Satellite = { url: string; bbox: [number, number, number, number]; attribution: string };

function satelliteFor(labCase: LabSite | null): Satellite | null {
  const source = labCase?.manifest?.satellite;
  if (!source || typeof source !== 'object') return null;
  const candidate = source as Partial<Satellite>;
  if (typeof candidate.url !== 'string' || typeof candidate.attribution !== 'string' || !candidate.attribution.trim()) return null;
  const bounds = candidate.bbox;
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)) return null;
  if (bounds[0] >= bounds[2] || bounds[1] >= bounds[3] || bounds[0] < -180 || bounds[2] > 180 || bounds[1] < -90 || bounds[3] > 90) return null;
  try {
    const url = new URL(candidate.url, window.location.href);
    if (url.protocol !== 'https:' && url.origin !== window.location.origin) return null;
    if (url.username || url.password) return null;
    return { url: url.href, bbox: bounds, attribution: candidate.attribution };
  } catch { return null; }
}

function surface(rings: Point[][], material: THREE.Material, height: number) {
  const shape = new THREE.Shape((rings[0] || []).map((point) => new THREE.Vector2(point.x, -point.z)));
  shape.holes = rings.slice(1).map((ring) => new THREE.Path(ring.map((point) => new THREE.Vector2(point.x, -point.z))));
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = height;
  mesh.receiveShadow = true;
  return mesh;
}

function outline(ring: Point[], material: THREE.LineBasicMaterial | THREE.LineDashedMaterial, height: number) {
  const points = ring.map((point) => new THREE.Vector3(point.x, height, point.z));
  if (points.length) points.push(points[0].clone());
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
  line.computeLineDistances();
  return line;
}

function disposeScene(scene: THREE.Scene) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    for (const material of mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

export default function LabScene({ labCase, site, elapsedMs, cameraMode, selectedEventId, onSelectEvent, showDetails = false }: LabSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef(elapsedMs);
  const modeRef = useRef(cameraMode);
  const selectedRef = useRef(selectedEventId);
  const selectEventRef = useRef(onSelectEvent);
  const northRef = useRef<HTMLSpanElement>(null);
  const scaleRef = useRef<HTMLSpanElement>(null);
  const scaleLabelRef = useRef<HTMLSpanElement>(null);
  const cameraActions = useRef<((key: string) => void) | null>(null);
  const detailsRef = useRef(showDetails); detailsRef.current = showDetails;
  const [webglError, setWebglError] = useState(false);
  const [satelliteState, setSatelliteState] = useState<'none' | 'loading' | 'ready' | 'error'>('none');
  elapsedRef.current = elapsedMs;
  modeRef.current = cameraMode;
  selectedRef.current = selectedEventId;
  selectEventRef.current = onSelectEvent;

  const frame = useMemo(() => labCase ? getReplayFrame(labCase, elapsedMs) : null, [labCase, elapsedMs]);
  const geography = labCase || site || null;
  const satellite = useMemo(() => satelliteFor(geography), [geography]);
  const terrainReference = geography?.manifest?.terrain;
  const [terrainResult, setTerrainResult] = useState<{ reference: typeof terrainReference; grid?: LabTerrain; error?: string }>();
  const [terrainEnabled, setTerrainEnabled] = useState(true);
  const terrain = terrainEnabled && terrainResult?.reference === terrainReference ? terrainResult?.grid : undefined;
  const terrainError = terrainResult?.reference === terrainReference ? terrainResult?.error : undefined;

  useEffect(() => {
    if (!terrainReference) return;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(terrainReference.url, { signal: controller.signal });
        if (!response.ok) throw new Error('Arquivo de relevo indisponível.');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 4 * 1024 * 1024) throw new Error('Grade de relevo excede 4 MB.');
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
        if (hash !== terrainReference.sha256) throw new Error('Checksum do relevo difere do caso salvo.');
        const grid = parseLabTerrain(JSON.parse(new TextDecoder().decode(bytes)), terrainReference);
        if (!controller.signal.aborted) setTerrainResult({ reference: terrainReference, grid });
      } catch (error) {
        if (!controller.signal.aborted) setTerrainResult({ reference: terrainReference, error: error instanceof Error ? error.message : 'Relevo inválido.' });
      }
    })();
    return () => controller.abort();
  }, [terrainReference]);

  const sampleTerrain = useMemo(() => terrain && geography ? createTerrainSampler(terrain, geography.origin) : null, [terrain, geography]);
  const outsideTerrain = !!(frame?.position && sampleTerrain && sampleTerrain(frame.position.x, frame.position.z) === null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    setWebglError(false);
    setSatelliteState(satellite ? 'loading' : 'none');
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      setWebglError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const groundHeight = (point: Point): number | null => {
      if (!sampleTerrain || !terrain) return 0;
      const height = sampleTerrain(point.x, point.z);
      return height === null ? null : height - terrain.minimum;
    };
    // Drape each segment at grid spacing; omit portions outside measured coverage.
    const drapeSegment = (a: Point, b: Point, offset: number): number[] => {
      const positions: number[] = [];
      const steps = terrain ? Math.min(4096, Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 5))) : 1;
      let previous: THREE.Vector3 | null = null;
      for (let i = 0; i <= steps; i++) {
        const point = { x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps };
        const y = groundHeight(point);
        const next = y === null ? null : new THREE.Vector3(point.x, y + offset, point.z);
        if (previous && next) positions.push(previous.x, previous.y, previous.z, next.x, next.y, next.z);
        previous = next;
      }
      return positions;
    };
    scene.background = new THREE.Color(0xe4e9e3);
    scene.add(new THREE.HemisphereLight(0xfff9e9, 0xb3c0b5, 2.6));
    const sunlight = new THREE.DirectionalLight(0xfff8e9, 3.3);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(1024, 1024);
    sunlight.shadow.camera.left = -22;
    sunlight.shadow.camera.right = 22;
    sunlight.shadow.camera.top = 22;
    sunlight.shadow.camera.bottom = -22;
    sunlight.shadow.camera.near = 1;
    sunlight.shadow.camera.far = 150;
    sunlight.shadow.bias = -0.00025;
    sunlight.shadow.normalBias = 0.03;
    scene.add(sunlight, sunlight.target);

    const bounds = new THREE.Box3();
    for (const polygon of geography?.polygons || []) for (const ring of polygon.rings) for (const point of ring) bounds.expandByPoint(new THREE.Vector3(point.x, 0, point.z));
    if (satellite && geography) {
      for (const [lon, lat] of [[satellite.bbox[0], satellite.bbox[1]], [satellite.bbox[2], satellite.bbox[3]]]) {
        const point = toLocalCoordinate(lon, lat, geography.origin);
        bounds.expandByPoint(new THREE.Vector3(point.x, 0, point.z));
      }
    }
    for (const sample of labCase?.samples || []) if (sample.x !== null && sample.z !== null) bounds.expandByPoint(new THREE.Vector3(sample.x, 0, sample.z));
    if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-65, 0, -50), new THREE.Vector3(65, 0, 50));
    const center = bounds.getCenter(new THREE.Vector3());
    center.y = groundHeight(center) ?? 0;
    const size = bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z, 80);
    scene.fog = new THREE.Fog(0xe4e9e3, span * 4, span * 10);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 8, span * 8), new THREE.MeshStandardMaterial({ color: 0xdce3d7, roughness: 1, depthWrite: !satellite }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(center.x, -0.06, center.z);
    ground.receiveShadow = true;
    scene.add(ground);

    const gridSize = Math.ceil((span + 140) / 20) * 20;
    const grid = new THREE.GridHelper(gridSize, gridSize / 20, 0xb8c7b8, 0xc2cec0);
    grid.position.set(center.x, -0.045, center.z);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    scene.add(grid);
    grid.visible = !satellite;

    const zoneOutlines: { role: LabPolygon['role']; material: THREE.LineBasicMaterial | THREE.LineDashedMaterial }[] = [];
    for (const polygon of geography?.polygons || []) {
      const water = polygon.role === 'water';
      const property = polygon.role === 'property_boundary';
      if (!property && !terrain) {
        const fill = new THREE.MeshStandardMaterial({ color: water ? 0x79b9c0 : 0xc3d5b8, roughness: water ? 0.48 : 1, transparent: true, opacity: satellite ? (water ? 0.4 : 0.15) : 1, depthWrite: !satellite, depthTest: !satellite });
        scene.add(surface(polygon.rings, fill, water ? 0.035 : 0));
      }
      for (const ring of polygon.rings) {
        const material = property ? new THREE.LineBasicMaterial({ color: 0xffd16a }) : water
          ? new THREE.LineBasicMaterial({ color: 0x398a96, transparent: true, opacity: 0.7 })
          : new THREE.LineDashedMaterial({ color: 0x53806a, dashSize: 2.2, gapSize: 1.4 });
        material.depthTest = false;
        const line = terrain
          ? new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ring.flatMap((point, index) => drapeSegment(point, ring[(index + 1) % ring.length], .15)), 3)), material)
          : outline(ring, material, 0.08);
        line.computeLineDistances();
        line.renderOrder = 2;
        scene.add(line);
        zoneOutlines.push({ role: polygon.role, material });
      }
    }

    let disposed = false;
    if (satellite && geography) {
      const [west, south, east, north] = satellite.bbox;
      const nw = toLocalCoordinate(west, north, geography.origin);
      const se = toLocalCoordinate(east, south, geography.origin);
        const geometry = new THREE.PlaneGeometry(se.x - nw.x, se.z - nw.z, terrain?.width || 1, terrain?.height || 1);
        if (terrain) {
          const vertices = geometry.getAttribute('position');
          for (let row = 0; row <= terrain.height; row++) for (let col = 0; col <= terrain.width; col++) {
            const point = { x: nw.x + (se.x - nw.x) * col / terrain.width, z: nw.z + (se.z - nw.z) * row / terrain.height };
            vertices.setZ(row * (terrain.width + 1) + col, groundHeight(point)!);
          }
          geometry.computeVertexNormals();
        }
        const baseMaterial = new THREE.MeshBasicMaterial({ color: 0xc3d5b8, toneMapped: false, depthWrite: !!terrain });
        const base = new THREE.Mesh(geometry, baseMaterial);
        base.rotation.x = -Math.PI / 2;
        base.position.set((nw.x + se.x) / 2, -0.025, (nw.z + se.z) / 2);
        base.receiveShadow = true;
        scene.add(base);
        if (terrain) {
          const shadows = new THREE.Mesh(geometry.clone(), new THREE.ShadowMaterial({ opacity: .28, depthWrite: false }));
          shadows.rotation.copy(base.rotation); shadows.position.copy(base.position); shadows.position.y += .015;
          shadows.receiveShadow = true;
          scene.add(shadows);
        }
      new THREE.TextureLoader().load(satellite.url, (texture) => {
        if (disposed) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        baseMaterial.color.setHex(0xffffff);
        baseMaterial.map = texture;
        baseMaterial.needsUpdate = true;
        setSatelliteState('ready');
      }, undefined, () => { if (!disposed) setSatelliteState('error'); });
    }

    const routePositions: number[] = [];
    const routeCounts: number[] = [];
    if (labCase) {
      labCase.samples.forEach((sample, index) => {
        const previous = labCase.samples[index - 1];
        if (previous && previous.x !== null && previous.z !== null && sample.x !== null && sample.z !== null && sample.elapsedMs - previous.elapsedMs <= Math.max(1_000, labCase.sampleIntervalMs * 2)) {
          routePositions.push(...drapeSegment({ x: previous.x, z: previous.z }, { x: sample.x, z: sample.z }, .12));
        }
        routeCounts.push(routePositions.length / 3);
      });
    }
    const routeGeometry = new THREE.BufferGeometry();
    routeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(routePositions, 3));
    scene.add(new THREE.LineSegments(routeGeometry, new THREE.LineBasicMaterial({ color: 0x638271, transparent: true, opacity: 0.3 })));
    const playedGeometry = routeGeometry.clone();
    playedGeometry.setDrawRange(0, 0);
    scene.add(new THREE.LineSegments(playedGeometry, new THREE.LineBasicMaterial({ color: 0x215f47, transparent: true, opacity: 0.88 })));

    const eventMarkers: THREE.Mesh[] = [];
    for (const event of labCase?.events || []) {
      const point = getReplayFrame(labCase!, event.elapsedMs).position;
      if (!point) continue;
      const markerHeight = groundHeight(point);
      if (markerHeight === null) continue;
      const marker = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.4, 32), new THREE.MeshBasicMaterial({ color: 0xc98a47, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthTest: false }));
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(point.x, markerHeight + 0.18, point.z);
      marker.userData.eventId = event.id;
      marker.renderOrder = 3;
      scene.add(marker);
      eventMarkers.push(marker);
    }

    const isTruck = labCase?.manifest?.machine?.model === 'Caminhão SOMPO';
    const tractor = isTruck ? createSompoTruckModel({ sensorLabel: 'DEMONSTRAÇÃO' }) : createLabTractor();
    const pivot = isTruck ? SOMPO_TRUCK_PIVOT_Y : 1.1;
    if ('rayGroup' in tractor) tractor.rayGroup.visible = false;
    const vehicle = new THREE.Group();
    tractor.root.position.y = -pivot;
    vehicle.add(tractor.root);
    scene.add(vehicle);
    const locator = new THREE.Mesh(new THREE.RingGeometry(3.1, 3.3, 48), new THREE.MeshBasicMaterial({ color: 0x2c6952, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    locator.rotation.x = -Math.PI / 2;
    scene.add(locator);
    const headingArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 6.5, 0x377158, 1.3, 0.9);
    scene.add(headingArrow);

    const camera = new THREE.PerspectiveCamera(39, 1, 0.15, Math.max(1800, span * 12));
    const controls = new OrbitControls(camera, renderer.domElement);
    let followDistance = 1;
    const zoomFollow = (event: WheelEvent) => {
      if (modeRef.current !== 'follow') return;
      event.preventDefault();
      followDistance = THREE.MathUtils.clamp(followDistance * Math.exp(event.deltaY * .001), .65, 4);
    };
    renderer.domElement.addEventListener('wheel', zoomFollow, { passive: false });
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.maxPolarAngle = Math.PI / 2 - 0.025;
    controls.minDistance = 7;
    controls.maxDistance = Math.max(span * 3, 300);
    controls.zoomSpeed = 0.8;
    controls.panSpeed = 0.65;
    const firstPosition = labCase?.samples.find((sample) => sample.x !== null && sample.z !== null);
    const lastKnownPosition = new THREE.Vector3(firstPosition?.x || 0, 0, firstPosition?.z || 0);
    const forward = new THREE.Vector3(1, 0, 0);
    let previousMode: LabCameraMode | null = null;
    let previousSampleIndex = -1;
    const followOffset = new THREE.Vector3();
    const followTarget = new THREE.Vector3();
    const projectedNorth = new THREE.Vector3();
    const projectedTarget = new THREE.Vector3();
    const projectedScale = new THREE.Vector3();
    const scaleDirection = new THREE.Vector3();
    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      if (modeRef.current === 'top') previousMode = null;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown: { x: number; y: number } | null = null;
    const down = (event: PointerEvent) => { pointerDown = { x: event.clientX, y: event.clientY }; };
    const up = (event: PointerEvent) => {
      if (!pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5) return;
      pointerDown = null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(eventMarkers)[0];
      if (hit) selectEventRef.current?.(String(hit.object.userData.eventId));
    };
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointerup', up);
    const lost = (event: Event) => { event.preventDefault(); setWebglError(true); };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    cameraActions.current = (key) => {
      if (modeRef.current === 'follow') {
        if (key === 'ArrowUp' || key === 'ArrowDown') followDistance = THREE.MathUtils.clamp(followDistance * (key === 'ArrowUp' ? .88 : 1.12), .65, 4);
        return;
      }
      const offset = camera.position.clone().sub(controls.target);
      if (key === 'ArrowLeft' || key === 'ArrowRight') offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), key === 'ArrowLeft' ? 0.12 : -0.12);
      else offset.multiplyScalar(key === 'ArrowUp' ? 0.88 : 1.12);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    };

    let animationFrame = 0;
    const render = () => {
      if (disposed) return;
      const current = labCase ? getReplayFrame(labCase, elapsedRef.current) : null;
      const sample = current?.sample;
      const hasAttitude = !!sample && sample.heading_deg !== null && sample.pitch_deg !== null && sample.roll_deg !== null;
      // Recorded samples only: GPS outages hide the machine and never join route segments.
      const elevation = current?.position ? groundHeight(current.position) : null;
      vehicle.visible = elevation !== null && hasAttitude;
      locator.visible = elevation !== null && (!hasAttitude || detailsRef.current);
      headingArrow.visible = elevation !== null && sample?.heading_deg != null && detailsRef.current;
      if (current?.position && elevation !== null) lastKnownPosition.set(current.position.x, elevation, current.position.z);
      vehicle.position.set(lastKnownPosition.x, lastKnownPosition.y + pivot, lastKnownPosition.z);
      if (sample && hasAttitude) {
        vehicle.rotation.set(
          THREE.MathUtils.degToRad(sample.roll_deg!),
          THREE.MathUtils.degToRad(90 - sample.heading_deg!),
          THREE.MathUtils.degToRad(sample.pitch_deg!),
          'YZX',
        );
      }
      const yaw = sample?.heading_deg != null ? THREE.MathUtils.degToRad(90 - sample.heading_deg) : vehicle.rotation.y;
      forward.set(Math.cos(yaw), 0, -Math.sin(yaw));
      if (labCase?.manifest?.demo === 'farm-truck-v1' && sampleTerrain && terrain && current?.position) {
        const p = current.position;
        const front = sampleTerrain(p.x + forward.x * 3, p.z + forward.z * 3);
        const rear = sampleTerrain(p.x - forward.x * 3, p.z - forward.z * 3);
        if (front !== null && rear !== null) vehicle.rotation.z = Math.atan2(front - rear, 6);
        // Display-only motion for the synthetic demo; recorded attitudes are never replaced.
        tractor.wheels.forEach(wheel => { wheel.rotation.y = -elapsedRef.current / 1000 * (sample?.ground_speed_kmh || 0) / 3.6 / .52; });
      }
      locator.position.set(lastKnownPosition.x, lastKnownPosition.y + 0.1, lastKnownPosition.z);
      headingArrow.position.set(lastKnownPosition.x, lastKnownPosition.y + 0.16, lastKnownPosition.z);
      headingArrow.setDirection(forward);
      if (current && previousSampleIndex !== current.sampleIndex) {
        playedGeometry.setDrawRange(0, routeCounts[current.sampleIndex] || 0);
        previousSampleIndex = current.sampleIndex;
      }
      if (current) {
        mount.dataset.sampleIndex = String(current.sampleIndex);
        mount.dataset.gps = current.hasGps ? 'available' : 'missing';
        mount.dataset.position = current.position ? `${current.position.x},${current.position.z}` : 'unavailable';
      }
      const outsideFence = current?.activeEvents.some((event) => event.type === 'outside_fence');
      const nearWater = current?.activeEvents.some((event) => event.type === 'near_water');
      const hasAlert = outsideFence || nearWater || current?.activeEvents.some((event) => event.type === 'coolant_warning');
      (locator.material as THREE.MeshBasicMaterial).color.setHex(hasAlert ? 0xc9823e : 0x2c6952);
      headingArrow.setColor(hasAlert ? 0xc9823e : 0x377158);
      for (const zone of zoneOutlines) {
        zone.material.visible = detailsRef.current;
        zone.material.color.setHex(zone.role === 'property_boundary' ? 0xffd16a : zone.role === 'water' ? (nearWater ? 0xc9823e : 0x398a96) : (outsideFence ? 0xc9823e : 0x53806a));
      }
      sunlight.position.set(lastKnownPosition.x + 35, 65, lastKnownPosition.z + 28);
      sunlight.target.position.copy(lastKnownPosition);
      for (const marker of eventMarkers) {
        const selected = marker.userData.eventId === selectedRef.current;
        marker.scale.setScalar(selected ? 1.9 : 1);
        (marker.material as THREE.MeshBasicMaterial).color.setHex(selected ? 0xb76c32 : 0xc98a47);
      }

      const mode = modeRef.current === 'follow' && !firstPosition ? 'top' : modeRef.current;
      if (mode !== previousMode) {
        controls.enableRotate = mode === 'free';
        controls.enablePan = mode !== 'follow';
        controls.enableZoom = mode !== 'follow';
        if (mode === 'top') {
          const halfView = Math.max(size.z * 0.62, size.x / camera.aspect * 0.62, 45);
          const height = halfView / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
          controls.target.copy(center);
          camera.position.set(center.x, center.y + height, center.z + 0.01);
          camera.lookAt(center);
        } else if (mode === 'free') {
          if (firstPosition) {
            controls.target.set(lastKnownPosition.x, lastKnownPosition.y + 0.7, lastKnownPosition.z);
            camera.position.set(lastKnownPosition.x + 30, lastKnownPosition.y + 25, lastKnownPosition.z + 32);
          } else {
            controls.target.copy(center);
            camera.position.set(center.x + span * 0.7, span, center.z + span * 0.7);
          }
        }
        previousMode = mode;
      }
      if (mode === 'follow') {
        // Camera composition follows the sample; the vehicle is never interpolated.
        followTarget.copy(lastKnownPosition).addScaledVector(forward, camera.aspect < 1 ? 0 : 2.5);
        followTarget.y += isTruck ? 1.4 : .6;
        followOffset.set(-forward.x * 12 + forward.z * 12, 7.5, -forward.z * 12 - forward.x * 12).multiplyScalar(followDistance * Math.max(1, .95 / camera.aspect));
        camera.position.copy(lastKnownPosition).add(followOffset);
        controls.target.copy(followTarget);
      }
      controls.update();
      projectedTarget.copy(controls.target).project(camera);
      projectedNorth.copy(controls.target);
      projectedNorth.z -= 1;
      projectedNorth.project(camera);
      if (northRef.current) northRef.current.style.transform = `rotate(${Math.atan2(projectedNorth.x - projectedTarget.x, projectedNorth.y - projectedTarget.y)}rad)`;
      scaleDirection.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
      projectedScale.copy(controls.target).add(scaleDirection).project(camera);
      const pixelsPerMeter = Math.abs(projectedScale.x - projectedTarget.x) * mount.clientWidth / 2;
      if (pixelsPerMeter > 0 && scaleRef.current && scaleLabelRef.current) {
        const magnitude = 10 ** Math.floor(Math.log10(100 / pixelsPerMeter));
        const meters = [5, 2, 1].map(value => value * magnitude).find(value => value * pixelsPerMeter <= 130) || magnitude;
        scaleRef.current.style.width = `${meters * pixelsPerMeter}px`;
        scaleLabelRef.current.textContent = `${meters >= 1000 ? `${meters / 1000} km` : `${meters} m`} · no centro`;
      }
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(render);
    };
    render();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', down);
      renderer.domElement.removeEventListener('pointerup', up);
      renderer.domElement.removeEventListener('wheel', zoomFollow);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      controls.dispose();
      cameraActions.current = null;
      sunlight.shadow.dispose();
      disposeScene(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [labCase, geography, satellite, terrain, sampleTerrain]);

  const handleCameraKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    cameraActions.current?.(event.key);
  };

  return (
    <div className="lab-scene" data-lab-scene data-camera={cameraMode} data-terrain={terrain ? 'ready' : terrainError ? 'error' : terrainReference && terrainEnabled ? 'loading' : 'flat'} data-satellite={satelliteState} data-site={geography?.manifest?.site?.id} style={{ position: 'relative', height: '100%', minHeight: 360 }}>
      <div ref={mountRef} className="lab-scene-canvas" data-lab-canvas tabIndex={0} role="img"
        aria-label={`Mapa da área. ${cameraMode === 'follow' && frame?.position ? 'Câmera acompanha a posição registrada.' : 'Arraste e use a roda do mouse ou as setas para navegar.'} ${terrain ? 'Relevo LiDAR, escala vertical 1:1' : 'Superfície plana'}, uma unidade equivale a um metro. ${!frame?.position ? 'Posição do equipamento indisponível.' : ''}`}
        onKeyDown={handleCameraKey} style={{ position: 'absolute', inset: 0 }} />
      <div className="lab-scene-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div className="lab-scene-topline">
          <span className="lab-scene-mode">{cameraMode === 'top' ? 'VISTA SUPERIOR' : cameraMode === 'follow' ? 'ACOMPANHANDO A MÁQUINA' : 'CÂMERA LIVRE'}</span>
          <span className="lab-scene-north" title="Norte geográfico"><span ref={northRef} style={{ display: 'inline-block' }}>↑</span> N</span>
        </div>
        <div className="lab-scene-legend" aria-label="Legenda do mapa">
          {geography?.polygons.some(p => p.role === 'property_boundary') && <span><i style={{ background: '#ffd16a' }} />Limite da propriedade (mapeado)</span>}
          <span><i style={{ background: '#6c9476' }} />{geography?.polygons.some(p => p.role === 'allowed_area') ? 'Área operacional permitida' : 'Área operacional não fornecida'}</span>
          <span><i style={{ background: '#79b9c0' }} />{geography?.polygons.some(p => p.role === 'water') ? 'Água mapeada' : 'Água não cadastrada'}</span>
          {labCase && <span><i style={{ background: '#215f47' }} />{labCase.synthetic ? 'Percurso sintético' : 'Trajetória GNSS'}{!labCase.samples.some(s => s.x !== null) ? ' indisponível' : ''}</span>}
        </div>
        {!!frame?.activeEvents.length && frame.position && (
          <div className="lab-scene-active-event" role="status">{frame.activeEvents.filter((event) => event.type !== 'gnss_unavailable').map((event) => event.title).join(' · ')}</div>
        )}
        {(webglError || (labCase && (!frame?.position || frame.sample.heading_deg === null || frame.sample.roll_deg === null || frame.sample.pitch_deg === null)) || !geography) && (
          <div className="lab-scene-status" role="status" data-lab-scene-status>
            <strong>{webglError ? 'Visualização 3D indisponível' : !labCase ? 'Seu próximo caso começa aqui' : frame?.recordingGap ? 'Lacuna no registro' : !frame?.position ? 'Posição GPS indisponível' : 'Orientação incompleta'}</strong>
            <span>{webglError ? 'A linha do tempo, os eventos e a análise continuam disponíveis.' : !labCase ? 'Abra um exemplo ou carregue os dados da máquina.' : frame?.recordingGap ? 'Não há amostra neste intervalo. A posição não foi reconstruída e o último registro não representa uma leitura atual.' : !frame?.position ? 'Movimento não reconstruído nesta lacuna. Os demais sinais continuam no relógio do caso.' : 'O marcador mantém a posição registrada; a atitude ausente não foi inventada.'}</span>
          </div>
        )}
        <div className="lab-scene-scale" aria-label="Escala do mapa"><span ref={scaleRef} /><span ref={scaleLabelRef} /></div>
        {!showDetails && (terrainError || outsideTerrain) && <p className="lab-terrain-alert" role="status">{terrainError ? 'Relevo indisponível · mapa plano' : 'Posição fora da cobertura do relevo'}</p>}
        {terrainReference && <div className="lab-scene-terrain">
          <button type="button" aria-pressed={terrainEnabled} onClick={() => setTerrainEnabled(value => !value)}>Relevo LiDAR {terrainEnabled ? 'ativado' : 'desativado'}</button>
          <span role="status">{terrainError ? `${terrainError} Superfície plana mantida.` : terrain ? `Grade ~${terrainReference.resolution_m} m · vertical 1:1 · ${terrain.minimum.toFixed(1)}–${terrain.maximum.toFixed(1)} m (${terrain.vertical_datum})` : terrainEnabled ? 'Carregando e verificando relevo…' : 'Mapa plano'}{outsideTerrain ? ' · Posição fora do recorte de relevo; marcador oculto.' : ''}</span>
        </div>}
        <p className="lab-scene-hint">{cameraMode === 'free' ? 'Arraste para orbitar · role para aproximar · ' : cameraMode === 'top' ? 'Arraste para mover · role para aproximar · ' : ''}{terrain ? 'Altura do solo; não medida pelo ESP32' : 'Superfície plana'}</p>
        <p className="lab-scene-attribution">{satelliteState === 'ready' ? `Imagem: ${satellite?.attribution}. ` : satelliteState === 'error' ? 'Imagem indisponível. ' : satelliteState === 'loading' ? 'Carregando imagem aérea… ' : 'Sem imagem aérea. '}{geography?.manifest?.site ? geography.manifest.site.name : labCase?.synthetic ? 'Campo e água fictícios.' : 'Polígonos associados ao caso.'}{terrain ? ` · Relevo: ${terrainReference?.attribution}` : ''}</p>
      </div>
    </div>
  );
}

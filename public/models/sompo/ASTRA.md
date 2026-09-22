# Astra SOMPO truck

`astra-sompo-truck.glb` is modeled locally in Blender 5.2 by
`scripts/sompo/build-astra-truck.py` (no purchased or downloaded truck model).
Rebuild from the repository root:

```sh
blender --background --factory-startup --python scripts/sompo/build-astra-truck.py
```

Round 10 replaces the American long-hood (Freightliner) with a generic
**Brazilian cab-over 6x2 rigid with a refrigerated box**, in the spirit of a
VW Constellation 24.280 / Mercedes Atego, with no manufacturer badge. The only
brand is the SOMPO wordmark on the box. Proportions follow Grok Imagine
reference photos (rear 3/4, front 3/4, side and rear close-up of Brazilian
reefer trucks); see `astra-sompo-truck.provenance.json`.

The asset is a visual skin in metres, +X forward, +Y up. Three groups:

- `astra-cab` (attached to `cab-assembly`): tilting cab lofted from rounded
  horizontal sections with a raked windscreen, real window openings (gaskets,
  glass, inward-facing interior lining, dash, left-hand steering wheel, seats),
  door seams and handle, grab handle, grille band with slats and indicators,
  tilt crease, sun visor, roof deflector, arm mirrors plus wide-angle and curb
  mirror, engine-air snorkel, grey bumper with recessed headlamps, fog lamps,
  turn signals, lower grille (ESP32 enclosure sits in front of it), plate,
  front mudguards and two-tread steps.
- `astra-cargo` (attached to `cargo-assembly`): smooth sandwich-panel box
  (1.36–3.80 m) with panel seams, aluminium top/bottom rails and corner posts,
  red/white Contran tape (sides, rear sill, rear posts), amber markers,
  subframe and cross-members, SOMPO wordmark; rear portal with two doors,
  rubber seals, three hinges per leaf, four lock bars with keepers, guides,
  cam plates and handles; refrigeration unit with condenser louvers and fan
  grilles on the front wall.
- `astra-chassis` (optional; attached to the rig's `chassis-dress`): diesel
  tanks with straps, battery box, air tanks, spare wheel on a carrier, side
  protection guards, tandem mudguards, rear mudflaps, rear light bar with
  multi-chamber lamps, plate and the striped underrun bumper, muffler.

When `astra-chassis` is present `refineSompoTruck` hides the procedural chassis
dress (tank, steps, guards, rear lamps, underrun bar, exhaust stack) and the
toroidal fenders, repaints wheel chrome as painted steel and shock chrome as
dark steel, lifts the ESP32 label above the roof deflector, and the scenario
effects move their brake/reverse/running/hazard lamps onto the new clusters.
Rails, axles, springs, driveshaft, wheels, suspension, ground support, sensor
aperture X=4.62 and physics are untouched. Without the GLB the procedural
model renders as before.

Box side panels and rear doors use `/sompo/gen/reefer-side-grime.jpg`, one
unrepeated map per side (rain streaks under the top rail, red-dirt road dust in
the bottom quarter). A 24-ray hemispherical visibility bake is stored in the
`CavityAO` vertex colour and used only for indirect light.

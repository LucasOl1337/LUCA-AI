# Astra SOMPO truck

`astra-sompo-truck.glb` was modeled locally in Blender 5.2 from the supplied
image-generation references, not downloaded from a third-party truck library.
Source: `scripts/sompo/build-astra-truck.py`.

Rebuild from the repository root:

```sh
blender --background --python scripts/sompo/build-astra-truck.py
```

The asset is a visual skin in metres, +X forward and +Y up. Its `astra-cab`
and `astra-cargo` groups attach to the corresponding existing modular assemblies.
It contains no replacement physics, wheel pivots, or ESP32 sensor. The existing
rig retains front aperture X=4.62, body pivot Y=1.92, wheel spin, suspension,
telemetry and exploded assembly controls. If the GLB cannot load, the procedural
model remains visible.

Round 9 matches the pixel target's Freightliner silhouette: a hollow day-cab
greenhouse with thinner A/B pillars and a larger camera-facing window, a hood
that tapers toward the grille with volumetric arched fenders and a power bulge,
a wide tall chrome Cascadia grille (`r6-grille-front`) with vertical bars and
four headlights beside it, west-coast mirrors, SwiftShader-safe cabin glass over
`r9-cabin-through-glass` (full-UV cards against the windscreen and +Z window,
dash 0.62, wheel ×2), a lower/longer horizontal corrugated reefer
(`r9-corrugation` albedo + 24 geometric ribs) and a large navy SOMPO wordmark.
Scene corn uses `r7-corn-plant-cutout.webp` (tassel, leaf gaps) with a denser
green fence line (skip 0.18).

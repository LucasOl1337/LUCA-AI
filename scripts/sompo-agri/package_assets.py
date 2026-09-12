"""Package painted GLBs, external atlases and reproducible provenance."""

import hashlib
import json
import shutil
import struct
from pathlib import Path

import trimesh
from PIL import Image

WORK = Path("/tmp/sompo-agri")
PUBLIC = Path("/home/lol/Projects/LUCA-AI/public/models/sompo")
CREATED_AT = "2026-09-11"

PROMPTS = {
    "tractor": """Photorealistic industrial product photograph for accurate single-image 3D reconstruction. One complete modern high-horsepower Brazilian row-crop farm tractor, design language broadly inspired by contemporary Valtra and John Deere machines but entirely unbranded, no logos, no letters, no readable text. Long sculpted dark forest-green engine hood with warm yellow accent panels, enclosed panoramic black-glass cab, four large deeply treaded agricultural tires with the rear pair substantially larger than the front pair, yellow steel wheel rims, front ballast block, exhaust stack, side steps, mirrors, work lights, rear three-point hitch and hydraulic connections visibly distinct. Correct plausible machinery proportions and clean continuous silhouette. Front-left three-quarter view with the tractor nose pointing toward the right side of the image, camera at axle height, 55 mm product lens. Entire tractor including all tires, mirrors, exhaust and hitch fully inside the frame with generous empty margin. Plain uniform very light gray seamless studio background and floor, diffuse neutral illumination, soft contact shadow only. Sharp focus throughout, realistic painted metal, rubber, glass and lightly dusty working surfaces. No field, no crop, no mud spray, no people, no other vehicle, no detached parts, no illustration, no miniature, no toy, no dramatic lighting.""",
    "harvester": """Photorealistic industrial product photograph for accurate single-image 3D reconstruction. One complete modern Brazilian self-propelled grain combine harvester, design language broadly inspired by contemporary John Deere S-series and Case IH machines but entirely unbranded, no logos, no letters, no readable text. Large dark forest-green body with warm yellow accent panels, high panoramic black-glass operator cab at front-left, huge deeply treaded front drive tires with yellow steel rims, smaller steerable rear tires, grain tank and folded unloading auger along the upper side, vents, ladders, handrails and realistic agricultural machinery panels. A wide corn/soy flex cutting header is attached across the front, clearly connected and entirely visible, with black reel, cutter bar and crop dividers; compact enough for one coherent silhouette. Correct plausible proportions. Front-left three-quarter view with machine travel direction toward the right side of image, camera near axle height, 55 mm product lens. Entire combine including header edges, tires, railings and auger fully inside frame with generous empty margin. Plain uniform very light gray seamless studio background and floor, diffuse neutral illumination, soft contact shadow only. Sharp focus throughout, realistic painted metal, rubber, glass and lightly dusty working surfaces. No field, no crop, no straw, no dust cloud, no people, no other vehicle, no detached parts, no illustration, no miniature, no toy, no dramatic lighting.""",
}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def image_roles(document):
    roles = {}
    for material in document.get("materials", []):
        pbr = material.get("pbrMetallicRoughness", {})
        fields = (
            ("basecolor", pbr.get("baseColorTexture")),
            ("metallicroughness", pbr.get("metallicRoughnessTexture")),
            ("normal", material.get("normalTexture")),
            ("occlusion", material.get("occlusionTexture")),
            ("emissive", material.get("emissiveTexture")),
        )
        for role, info in fields:
            if info:
                source_index = document["textures"][info["index"]]["source"]
                roles.setdefault(source_index, role)
    return roles


def package(machine_name):
    stem = f"generated-agri-{machine_name}"
    source_glb = WORK / f"{machine_name}-textured.glb"
    data = source_glb.read_bytes()
    json_length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20 : 20 + json_length])
    tail = data[20 + json_length :]
    binary = data[28 + json_length :]

    loaded = trimesh.load(source_glb)
    geometries = list(loaded.geometry.values())
    for index, mesh_definition in enumerate(document.get("meshes", [])):
        mesh_definition.setdefault("extras", {})["sompoAgri"] = {
            "equipment": machine_name,
            "forwardAxisBeforeRuntime": "+Z",
        }
        if index < len(geometries):
            mesh_definition["extras"]["groundSupport"] = geometries[index].convex_hull.vertices.reshape(-1).tolist()

    for material in document.get("materials", []):
        material.get("extensions", {}).pop("KHR_materials_specular", None)
        if not material.get("extensions"):
            material.pop("extensions", None)
        pbr = material.setdefault("pbrMetallicRoughness", {})
        pbr["metallicFactor"] = 0.35
        pbr["roughnessFactor"] = 1.0
        material["doubleSided"] = False
    for key in ("extensionsUsed", "extensionsRequired"):
        if key in document:
            document[key] = [value for value in document[key] if value != "KHR_materials_specular"]
            if not document[key]:
                document.pop(key)

    document.setdefault("asset", {})["copyright"] = (
        f"LUCA-AI Sompo agricultural {machine_name}; see SOMPO-AGRI-ASSET-LICENSE.txt "
        f"and {stem}.provenance.json"
    )
    encoded = json.dumps(document, separators=(",", ":")).encode()
    encoded += b" " * ((-len(encoded)) % 4)
    packed = (
        struct.pack("<III", 0x46546C67, 2, 20 + len(encoded) + len(tail))
        + struct.pack("<II", len(encoded), 0x4E4F534A)
        + encoded
        + tail
    )
    output_glb = PUBLIC / f"{stem}.glb"
    output_glb.write_bytes(packed)

    roles = image_roles(document)
    manifest_images = []
    dimensions = []
    for index, image_definition in enumerate(document.get("images", [])):
        view = document["bufferViews"][image_definition["bufferView"]]
        extension = ".jpg" if image_definition["mimeType"] == "image/jpeg" else ".png"
        role = roles.get(index, f"image-{index}")
        filename = f"{stem}-{role}{extension}"
        begin = view.get("byteOffset", 0)
        end = begin + view["byteLength"]
        destination = PUBLIC / filename
        destination.write_bytes(binary[begin:end])
        manifest_images.append(filename)
        dimensions.append(list(Image.open(destination).size))

    manifest_path = PUBLIC / f"{stem}.textures.json"
    manifest_path.write_text(
        json.dumps({"images": manifest_images}, indent=2) + "\n", encoding="utf-8"
    )
    source_image = PUBLIC / f"{stem}-source.png"
    shutil.copyfile(WORK / f"{machine_name}-source.png", source_image)

    triangles = sum(
        document["accessors"][primitive["indices"]]["count"] // 3
        for mesh in document["meshes"]
        for primitive in mesh["primitives"]
    )
    provenance = {
        "asset": output_glb.name,
        "generatedBy": "LUCA-AI",
        "createdAt": CREATED_AT,
        "sourceImage": source_image.name,
        "sourceImageSha256": sha256(source_image),
        "sourcePrompt": PROMPTS[machine_name],
        "imageModel": "cx/gpt-image-2 via local 9Router /v1/images/generations",
        "imageDimensions": list(Image.open(source_image).size),
        "backgroundRemoval": "Hunyuan3D U2Net BackgroundRemover; generated original is preserved beside the GLB",
        "reconstruction": "Tencent Hunyuan3D-2.1",
        "reconstructionRevision": "82920d643c0dc2f7bfd7255f45f62d386edfe60c",
        "weightsRevision": "0b94677654c57bb9a6b6845cd7b704ccf551d327",
        "shape": {
            "steps": 50,
            "guidance": 5,
            "octreeResolution": 384,
            "seed": 142 if machine_name == "tractor" else 243,
            "retopologyTargetTriangles": 28_000,
            "metrics": json.loads((WORK / f"{machine_name}-shape.json").read_text()),
        },
        "texture": {
            "views": 6,
            "viewResolution": 512,
            "atlasResolution": 2048,
            "exportedImageDimensions": dimensions,
            "externalManifest": manifest_path.name,
            "metrics": json.loads((WORK / f"{machine_name}-paint.json").read_text()),
        },
        "triangles": triangles,
        "adaptations": [
            "Quadric edge-collapse retopology before UV unwrap and PBR painting",
            "Boundary and normals preservation enabled during reduction",
            "Invalid upstream KHR_materials_specular values removed",
            "Byte-identical embedded images extracted for CSP-safe restoreSompoTextures loading",
            "Runtime loader rotates generated +Z forward axis to Sompo +X and fits nominal dimensions",
        ],
        "limitations": [
            "Single source image: hidden surfaces and mechanical details are inferred",
            "The reconstructed shell is not CAD-accurate and is not separated into independently articulated parts",
            "Fine handrails, header teeth, hydraulic lines and tire lugs may contain reconstruction artifacts",
        ],
        "license": "SOMPO-AGRI-ASSET-LICENSE.txt",
        "hunyuanLicense": "HUNYUAN-COMMUNITY-LICENSE.txt",
        "sha256": sha256(output_glb),
        "bytes": output_glb.stat().st_size,
    }
    (PUBLIC / f"{stem}.provenance.json").write_text(
        json.dumps(provenance, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(stem, triangles, output_glb.stat().st_size, sha256(output_glb))


for name in ("tractor", "harvester"):
    package(name)


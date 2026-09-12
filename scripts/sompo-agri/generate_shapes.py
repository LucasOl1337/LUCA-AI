"""Reconstruct and retopologize the two Sompo agricultural machines.

Run from the LUCA-AI checkout after placing tractor-source.png and
harvester-source.png in /tmp/sompo-agri. The transformer blocks are streamed
through CUDA one at a time so this pipeline can coexist with other GPU work.
"""

import json
import os
import sys
import time
from pathlib import Path

os.environ["HF_HOME"] = "/home/lol/.cache/sompo-3d/huggingface"
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

import pymeshlab
import torch
from accelerate import cpu_offload_with_hook
from diffusers.models.attention import FeedForward
from PIL import Image

REPO = Path("/home/lol/.cache/sompo-3d/Hunyuan3D-2.1")
WORK = Path("/tmp/sompo-agri")
CHECKPOINT = Path(
    "/home/lol/.cache/sompo-3d/huggingface/hub/"
    "models--tencent--Hunyuan3D-2.1/snapshots/"
    "0b94677654c57bb9a6b6845cd7b704ccf551d327"
)
TARGET_TRIANGLES = 28_000

sys.path.insert(0, str(REPO / "hy3dshape"))
from hy3dshape import Hunyuan3DDiTFlowMatchingPipeline  # noqa: E402
from hy3dshape.rembg import BackgroundRemover  # noqa: E402


def build_offloaded_pipeline():
    pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
        str(CHECKPOINT), device="cpu", dtype=torch.float16
    )
    pipeline.components = {
        name: getattr(pipeline, name) for name in ("conditioner", "model", "vae")
    }
    _, condition_hook = cpu_offload_with_hook(pipeline.conditioner, "cuda")
    _, vae_hook = cpu_offload_with_hook(
        pipeline.vae, "cuda", prev_module_hook=condition_hook
    )
    for name, module in pipeline.model.named_children():
        if name != "blocks":
            module.to("cuda")
    for name, value in list(pipeline.model.named_buffers(recurse=False)):
        setattr(pipeline.model, name, value.to("cuda"))
    pipeline.model.register_forward_pre_hook(lambda *_: condition_hook.offload())

    for block in pipeline.model.blocks:
        original = block.forward

        def streamed(*args, block=block, original=original, **kwargs):
            block.to("cuda")
            try:
                return original(*args, **kwargs)
            finally:
                block.to("cpu")

        block.forward = streamed

    for module in pipeline.model.modules():
        if isinstance(module, FeedForward):
            original = module.forward

            def chunked(value, *args, original=original, **kwargs):
                shape = value.shape
                flat = value.reshape(-1, shape[-1])
                chunks = [
                    original(chunk, *args, **kwargs)
                    for chunk in flat.split(256, dim=0)
                ]
                return torch.cat(chunks, dim=0).reshape(*shape[:-1], -1)

            module.forward = chunked

    pipeline.device = torch.device("cuda")
    return pipeline, vae_hook


def reconstruct(pipeline, vae_hook, name, seed):
    source = WORK / f"{name}-source.png"
    cutout = WORK / f"{name}-source-cutout.png"
    if not cutout.exists():
        BackgroundRemover()(Image.open(source)).save(cutout)

    started = time.time()
    latents_path = WORK / f"{name}-latents.pt"
    if latents_path.exists():
        latents = torch.load(latents_path, map_location="cuda", weights_only=True)
    else:
        latents = pipeline(
            image=Image.open(cutout),
            num_inference_steps=50,
            guidance_scale=5.0,
            output_type="latent",
            generator=torch.Generator(device="cuda").manual_seed(seed),
        )
        torch.save(latents.cpu(), latents_path)

    with torch.inference_mode():
        pipeline.set_surface_extractor("mc")
        mesh = pipeline._export(
            latents.to("cuda"), octree_resolution=384, num_chunks=8_000
        )[0]
    vae_hook.offload()
    torch.cuda.empty_cache()

    shape_path = WORK / f"{name}-shape.obj"
    optimized_path = WORK / f"{name}-optimized.obj"
    mesh.export(shape_path)
    mesh_set = pymeshlab.MeshSet()
    mesh_set.load_new_mesh(str(shape_path))
    mesh_set.meshing_decimation_quadric_edge_collapse(
        targetfacenum=TARGET_TRIANGLES,
        preservenormal=True,
        preserveboundary=True,
        qualitythr=0.7,
        planarquadric=True,
    )
    mesh_set.save_current_mesh(str(optimized_path))
    metrics = {
        "seconds": round(time.time() - started, 3),
        "sourceTriangles": len(mesh.faces),
        "triangles": mesh_set.current_mesh().face_number(),
        "peakVramGb": round(torch.cuda.max_memory_allocated() / 1e9, 3),
        "offload": "streamed transformer blocks; CPU-offloaded conditioner and VAE",
    }
    (WORK / f"{name}-shape.json").write_text(
        json.dumps(metrics, indent=2) + "\n", encoding="utf-8"
    )
    print(name, json.dumps(metrics), flush=True)


pipeline, vae_hook = build_offloaded_pipeline()
for machine_name, machine_seed in (("tractor", 142), ("harvester", 243)):
    reconstruct(pipeline, vae_hook, machine_name, machine_seed)

"""Paint the retopologized Sompo agricultural machines with CPU offload."""

import inspect
import json
import os
import sys
import textwrap
import time
from pathlib import Path

os.environ["HF_HOME"] = "/home/lol/.cache/sompo-3d/huggingface"
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

REPO = Path("/home/lol/.cache/sompo-3d/Hunyuan3D-2.1")
WORK = Path("/tmp/sompo-agri")
os.chdir(REPO)
sys.path[:0] = [str(REPO / "hy3dpaint"), str(REPO / "hy3dshape"), str(REPO)]

import torch
import torchvision.transforms.functional as tvfunctional

sys.modules["torchvision.transforms.functional_tensor"] = tvfunctional
from textureGenPipeline import Hunyuan3DPaintConfig, Hunyuan3DPaintPipeline  # noqa: E402


class OffloadedDino(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, image):
        self.model.to("cuda")
        try:
            return self.model(image)
        finally:
            self.model.to("cpu")
            torch.cuda.empty_cache()


config = Hunyuan3DPaintConfig(6, 512)
config.device = "cpu"
config.render_size = 1024
config.texture_size = 2048
config.realesrgan_ckpt_path = str(REPO / "hy3dpaint/ckpt/RealESRGAN_x4plus.pth")
paint = Hunyuan3DPaintPipeline(config)
multiview = paint.models["multiview_model"]
multiview.dino_v2 = OffloadedDino(multiview.dino_v2)

# Learned conditioning is accessed before the offloaded UNet forward hook.
multiview.pipeline._sompo_text_tokens = {
    f"learned_text_clip_{token}": getattr(
        multiview.pipeline.unet, f"learned_text_clip_{token}"
    ).detach().cpu().clone()
    for token in (*multiview.pipeline.unet.pbr_setting, "ref")
}
multiview.pipeline.unet._sompo_text_tokens = multiview.pipeline._sompo_text_tokens
wrapper = type(multiview.pipeline.unet)
source = textwrap.dedent(inspect.getsource(wrapper.forward)).replace(
    "self.unet.learned_text_clip_ref.repeat(B, N_ref, 1, 1)",
    'self._sompo_text_tokens["learned_text_clip_ref"].to(ref_latents.device).repeat(B, N_ref, 1, 1)',
)
namespace = {}
exec(
    compile(source, "<sompo-agri-offload-ref-token>", "exec"),
    sys.modules[wrapper.__module__].__dict__,
    namespace,
)
wrapper.forward = namespace["forward"]
multiview.pipeline.enable_sequential_cpu_offload()
multiview.pipeline.enable_vae_slicing()
multiview.pipeline.enable_vae_tiling()
paint.models["super_model"].upsampler.tile_size = 256

for machine_name in ("tractor", "harvester"):
    started = time.time()
    paint(
        mesh_path=str(WORK / f"{machine_name}-optimized.obj"),
        image_path=str(WORK / f"{machine_name}-source-cutout.png"),
        output_mesh_path=str(WORK / f"{machine_name}-textured.obj"),
        use_remesh=False,
    )
    metrics = {
        "seconds": round(time.time() - started, 3),
        "peakVramGb": round(torch.cuda.max_memory_allocated() / 1e9, 3),
        "offload": "sequential diffusion offload; independently offloaded DINO; tiled VAE and upscaler",
    }
    (WORK / f"{machine_name}-paint.json").write_text(
        json.dumps(metrics, indent=2) + "\n", encoding="utf-8"
    )
    print(machine_name, json.dumps(metrics), flush=True)

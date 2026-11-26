"""Build the local gameplay GLB from the untouched Sketchfab GLB copy."""
import json
from pathlib import Path
import struct

ASSETS = Path(__file__).resolve().parent / "assets"
# Keep the entrance shell, painted step guides, escalators, and underground surfaces.
OMIT = {
    "Ground", "Stolb_low", "Black", "Terminal", "Terminal_low.003",
    "Terminal_low.002", "TerminalG2_low", "Terminal.004", "TerminalBox_low",
    "SCreen_Handlers.002", "SCreen_Handlers.001", "SCreen_Handlers.003",
    "SCreen_Handlers", "Screens_low.003", "Screens_low.001",
}


def pad(raw, byte=b"\0"):
    return raw + byte * (-len(raw) % 4)


def prepare():
    source = (ASSETS / "original.glb").read_bytes()
    json_size, = struct.unpack_from("<I", source, 12)
    document = json.loads(source[20:20 + json_size])
    source_bin = source[28 + json_size:]
    nodes = document["nodes"]
    picked = [i for i in nodes[1]["children"] if nodes[i]["name"] not in OMIT]
    node_ids = [0, 1] + [j for i in picked for j in (i, nodes[i]["children"][0])]
    mapping = {old: new for new, old in enumerate(node_ids)}
    nodes[1]["children"] = picked
    kept = {**document, "nodes": [], "accessors": [], "meshes": [], "bufferViews": [],
            "images": [], "textures": [], "materials": [document["materials"][1]]}
    binary = bytearray()

    def copy_range(view, offset, length):
        start = view.get("byteOffset", 0) + offset
        new_view = {**view, "byteOffset": len(binary), "byteLength": length}
        binary.extend(pad(source_bin[start:start + length]))
        kept["bufferViews"].append(new_view)
        return len(kept["bufferViews"]) - 1

    def copy_accessor(index):
        accessor = document["accessors"][index].copy()
        view = document["bufferViews"][accessor["bufferView"]]
        # The source uses contiguous unsigned-int indices and float vertex attributes.
        length = accessor["count"] * view.get("byteStride", 4)
        accessor["bufferView"] = copy_range(view, accessor.pop("byteOffset", 0), length)
        kept["accessors"].append(accessor)
        return len(kept["accessors"]) - 1

    for index in node_ids:
        node = nodes[index].copy()
        if "children" in node:
            node["children"] = [mapping[i] for i in node["children"]]
        if "mesh" in node:
            mesh = document["meshes"][node["mesh"]].copy()
            primitive, = mesh["primitives"]
            primitive = {**primitive, "material": 0, "indices": copy_accessor(primitive["indices"]),
                         "attributes": {key: copy_accessor(i) for key, i in primitive["attributes"].items()}}
            mesh["primitives"] = [primitive]
            node["mesh"] = len(kept["meshes"])
            kept["meshes"].append(mesh)
        kept["nodes"].append(node)

    # Keep the four 1024 px entrance atlases. The removed ground and terminal used separate maps.
    for index in (3, 4, 5, 6):
        image = document["images"][index].copy()
        view = document["bufferViews"][image["bufferView"]]
        image["bufferView"] = copy_range(view, 0, view["byteLength"])
        kept["images"].append(image)
        kept["textures"].append({**document["textures"][index], "source": index - 3})
    material = kept["materials"][0]
    for tex in (material["normalTexture"], material["occlusionTexture"],
                material["emissiveTexture"], *material["pbrMetallicRoughness"].values()):
        tex["index"] -= 3
    kept["buffers"] = [{"byteLength": len(binary)}]
    encoded = pad(json.dumps(kept, separators=(",", ":")).encode(), b" ")
    glb = struct.pack("<4sIIII", b"glTF", 2, 28 + len(encoded) + len(binary), len(encoded), 0x4E4F534A)
    glb += encoded + struct.pack("<II", len(binary), 0x004E4942) + binary
    (ASSETS / "entrance.glb").write_bytes(glb)


if __name__ == "__main__":
    prepare()

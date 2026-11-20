"""Create the original commuter mesh and its rest-pose skin, using only Python."""
from collections import defaultdict
from math import cos, pi, sin
from pathlib import Path
import json
import struct

OUT = Path(__file__).resolve().parents[1] / "model" / "commuter.glb"
PALETTE = {
    "Navy wool": "303b55", "Navy facing": "414c64", "Cotton": "d9d9d2",
    "Trousers": "626368", "Skin": "bb8e72", "Hair": "211f22",
    "Detail": "383234", "Leather": "272a30", "Sole": "373a40",
    "Pack canvas": "353438", "Pack trim": "464246", "Hardware": "76695d",
}
joints = []
triangles = defaultdict(list)


def joint(name, parent, x, y, z=0):
    joints.append((name, parent, (x, y, z)))
    return len(joints) - 1


root = joint("Root", None, 0, 0, 0)
hips = joint("Pelvis", root, 0, .90)
spine = joint("Spine", hips, 0, 1.065)
chest = joint("Chest", spine, 0, 1.31)
neck = joint("Neck", chest, 0, 1.48)
head = joint("Head", neck, 0, 1.57)


def weight(a, b=None, t=0):
    return ((a, a if b is None else b, 0, 0), (1-t, t, 0, 0))


def loft(material, profiles, sides=12, power=1, shape=None, caps=True):
    """Skin a sequence of horizontal cross-sections, from bottom to top."""
    rows = []
    for row, (y, x, z, width, depth, weights) in enumerate(profiles):
        ring = []
        for i in range(sides):
            angle = i * 2*pi / sides
            a, b = sin(angle), -cos(angle)
            point = (x + width * (abs(a)**power if a >= 0 else -abs(a)**power),
                     y, z + depth * (abs(b)**power if b >= 0 else -abs(b)**power))
            if shape:
                point = shape(point, row, i, a, b)
            ring.append((point, weights))
        rows.append(ring)

    for index, (low, high) in enumerate(zip(rows, rows[1:])):
        for i in range(sides):
            n = (i+1) % sides
            if (index+i) % 2:
                triangles[material] += [(low[i], high[i], low[n]), (low[n], high[i], high[n])]
            else:
                triangles[material] += [(low[i], high[i], high[n]), (low[i], high[n], low[n])]

    if caps:
        for idx in ((-1,) if caps == "top" else (0, -1)):
            y, x, z, _, _, weights = profiles[idx]
            center = ((x, y, z), weights)
            for i in range(sides):
                a, b = rows[idx][i], rows[idx][(i+1)%sides]
                triangles[material].append((center, a, b) if idx == 0 else (center, b, a))


def band(material, points, width, bone, vertical=False):
    """A narrow strip defined by surface-following 3D centerline points."""
    edges = []
    for x, y, z in points:
        if vertical:
            points_at_edges = ((x,y-width/2,z), (x,y+width/2,z))
        else:
            points_at_edges = ((x-width/2,y,z), (x+width/2,y,z))
        edges.append(tuple((point,weight(bone)) for point in points_at_edges))
    for (a,b),(c,d) in zip(edges, edges[1:]):
        # The strip is double-sided for use on the chest and back.
        triangles[material] += [(a,c,b), (b,c,d)]


def panel(material, coords, bone):
    points = [(p, weight(bone)) for p in coords]
    for i in range(1, len(points)-1):
        triangles[material].append((points[0], points[i], points[i+1]))


def rows(bone, coordinates):
    return [(*values, weight(bone)) for values in coordinates]


# Adult proportions. The shoulder seam and sleeves share a continuous silhouette.
loft("Navy wool", [
    (.888,0,.008,.188,.107,weight(hips)), (.926,0,.007,.192,.109,weight(hips)),
    (1.034,0,.001,.161,.098,weight(hips,spine,.65)),
    (1.155,0,.001,.167,.106,weight(spine)),
    (1.291,0,0,.195,.122,weight(chest)), (1.387,0,.002,.215,.108,weight(chest)),
    (1.434,0,.004,.207,.084,weight(chest)), (1.473,0,.005,.121,.068,weight(chest)),
    (1.484,0,.003,.068,.061,weight(chest)),
], power=.85)
loft("Trousers", rows(hips, [
    (.827,0,.012,.128,.08), (.882,0,.011,.167,.088), (.979,0,.01,.148,.09),
]), power=.78)

loft("Skin", rows(neck, [
    (1.459,0,.008,.056,.049), (1.51,0,.008,.052,.047),
    (1.579,0,.012,.056,.052),
]), 10)
loft("Cotton", rows(chest, [
    (1.471,0,.001,.066,.061), (1.499,0,.004,.06,.058),
]), 12, caps=False)
panel("Cotton", [(-.066,1.47,-.058), (0,1.217,-.121), (.066,1.47,-.058),
                 (.04,1.489,-.041), (-.04,1.489,-.041)], chest)
for sign in (-1,1):
    panel("Navy facing", [(sign*.047,1.482,-.048), (sign*.106,1.433,-.074),
         (sign*.082,1.384,-.111), (sign*.098,1.372,-.106),
         (sign*.018,1.232,-.123), (sign*.033,1.353,-.119)], chest)
    band("Navy facing", [(sign*.086,1.103,-.101),(sign*.128,1.111,-.082)], .011, spine)
band("Navy facing", [(0,.91,-.106),(0,1.03,-.099),(0,1.14,-.108),(0,1.235,-.123)], .005, spine)
for y,z in [(1.145,-.112),(1.066,-.108)]:
    loft("Detail", rows(spine,[(y-.005,.01,z,.005,.002),(y+.005,.01,z,.004,.002)]), 6)

# Face rings describe jaw, cheekbones, brow and skull as one connected mesh.
def face(point, ring, i, a, b):
    x,y,z = point
    if b < -.86:
        z -= [0,.006,.005,.006,.022,.005,.002,0,0][ring] * (-b)**8
    return x,y,z


loft("Skin", rows(head, [
    (1.555,0,-.011,.041,.056), (1.572,0,-.01,.064,.075),
    (1.607,0,-.004,.077,.081), (1.637,0,.003,.082,.078),
    (1.664,0,.003,.086,.078), (1.699,0,.008,.087,.078),
    (1.733,0,.009,.079,.069), (1.764,0,.015,.061,.052),
    (1.782,0,.016,.027,.027),
]),16,shape=face)

def hairline(point, ring, i, a, b):
    x,y,z=point
    if ring == 0:
        y += max(0,-b)*.083 + max(0,-b)*.008*sin(i * 1.8)
        z -= max(0,-b)*.011
    if ring == 2:
        y += x*.12
    return x,y,z


loft("Hair",rows(head,[
    (1.619,0,.011,.088,.084), (1.717,.001,.009,.093,.087),
    (1.765,-.006,.01,.086,.078), (1.789,-.009,.008,.062,.057),
    (1.801,-.017,.002,.028,.026),
]),16,shape=hairline,caps="top")
for sign in (-1,1):
    loft("Skin", rows(head, [(1.614,sign*.08,.008,.011,.011),
        (1.632,sign*.087,.007,.012,.014),(1.658,sign*.085,.009,.01,.012),
        (1.667,sign*.081,.01,.005,.007)]),8)
    panel("Detail", [(sign*.017,1.682,-.076),(sign*.038,1.684,-.068),
        (sign*.052,1.679,-.061),(sign*.023,1.678,-.074)],head)
panel("Detail",[(-.018,1.615,-.087),(0,1.613,-.090),(.018,1.615,-.087),(0,1.610,-.088)],head)

for sign, side in [(-1,"L"),(1,"R")]:
    arm = joint("UpperArm."+side,chest,sign*.189,1.407,.005)
    elbow = joint("Forearm."+side,arm,sign*.232,1.165,.007)
    wrist = joint("Hand."+side,elbow,sign*.243,.986,-.014)
    thigh = joint("Thigh."+side,hips,sign*.089,.882,.008)
    shin = joint("Shin."+side,thigh,sign*.091,.483,-.003)
    foot = joint("Foot."+side,shin,sign*.096,.115,.012)
    loft("Navy wool",[
        (.973,sign*.242,-.012,.042,.04,weight(elbow)),
        (1.016,sign*.245,-.006,.044,.045,weight(elbow)),
        (1.104,sign*.241,0,.051,.052,weight(elbow)),
        (1.185,sign*.234,.006,.056,.058,weight(elbow,arm,.48)),
        (1.299,sign*.221,.009,.065,.066,weight(arm)),
        (1.396,sign*.193,.004,.067,.065,weight(arm,chest,.28)),
        (1.432,sign*.180,0,.055,.05,weight(chest,arm,.5)),
    ],10)
    loft("Navy facing",rows(elbow,[(.974,sign*.242,-.012,.043,.041),
        (.993,sign*.244,-.01,.044,.042)]),10,caps=False)
    loft("Cotton",rows(wrist,[(.964,sign*.241,-.012,.032,.032),
        (.978,sign*.242,-.011,.037,.033)]),10)
    loft("Skin",rows(wrist,[(.871,sign*.246,-.018,.012,.015),
        (.890,sign*.248,-.019,.018,.022),(.922,sign*.247,-.018,.024,.026),
        (.956,sign*.241,-.013,.024,.025),(.980,sign*.242,-.011,.024,.026)]),10)
    loft("Skin",rows(wrist,[(.897,sign*.225,-.040,.007,.009),
        (.920,sign*.224,-.037,.010,.012),(.943,sign*.229,-.029,.012,.013)]),8)
    loft("Trousers",[
        (.108,sign*.099,.007,.051,.054,weight(shin)),
        (.161,sign*.098,.010,.054,.056,weight(shin)),
        (.322,sign*.094,.008,.065,.061,weight(shin)),
        (.444,sign*.092,.002,.068,.062,weight(shin,thigh,.28)),
        (.500,sign*.091,-.005,.073,.069,weight(thigh,shin,.55)),
        (.676,sign*.092,.005,.083,.078,weight(thigh)),
        (.806,sign*.090,.008,.092,.086,weight(thigh)),
        (.907,sign*.085,.011,.087,.084,weight(thigh,hips,.35)),
    ],12,power=.86)
    loft("Sole",rows(foot,[(.001,sign*.099,-.047,.052,.129),(.018,sign*.099,-.047,.055,.133),
        (.031,sign*.099,-.046,.055,.132)]),12,power=.70)
    loft("Leather",rows(foot,[(.025,sign*.099,-.045,.054,.131),(.046,sign*.099,-.046,.055,.129),
        (.071,sign*.099,-.029,.051,.109),(.10,sign*.099,.008,.048,.071),
        (.138,sign*.099,.010,.041,.052)]),12,power=.75)
    for y,z in [(.079,-.109),(.088,-.090),(.098,-.071)]:
        panel("Sole",[(sign*.099-.025,y,z),(sign*.099+.025,y,z),
            (sign*.099+.025,y+.006,z+.008),(sign*.099-.025,y+.006,z+.008)],foot)

# Pack body, front pocket (rear-facing), zipper and shoulder straps.
loft("Pack canvas", rows(chest, [
    (1.005,0,.154,.104,.053),(1.033,0,.155,.128,.067),
    (1.109,0,.165,.133,.075),(1.256,0,.167,.13,.07),
    (1.330,0,.157,.118,.059),(1.363,0,.146,.087,.044),
    (1.375,0,.143,.057,.030),
]), 12, power=.51)
loft("Pack trim", rows(chest, [
    (1.047,0,.21,.087,.018),(1.069,0,.221,.106,.025),
    (1.176,0,.223,.112,.028),(1.224,0,.218,.104,.022),
    (1.239,0,.214,.088,.016),
]), 12, power=.53)
panel("Pack canvas",[(-.095,1.222,.242),(.095,1.222,.242),
    (.099,1.209,.244),(-.099,1.209,.244)],chest)
panel("Hardware",[(.076,1.222,.245),(.083,1.222,.245),(.084,1.199,.249),(.077,1.199,.249)],chest)
panel("Navy facing",[(-.024,1.169,.252),(.024,1.169,.252),
    (.024,1.141,.253),(-.024,1.141,.253)],chest)
for sign in (-1,1):
    band("Pack canvas",[(sign*.095,1.069,-.092),(sign*.119,1.176,-.102),
        (sign*.133,1.28,-.106),(sign*.137,1.378,-.089),(sign*.136,1.446,-.058),
        (sign*.130,1.475,-.012),(sign*.130,1.475,.028),(sign*.125,1.450,.066),
        (sign*.109,1.403,.116),(sign*.087,1.352,.148)],.034,chest)
    band("Pack canvas",[(sign*.113,1.06,.157),(sign*.142,1.074,.101),
        (sign*.168,1.105,.063),(sign*.178,1.128,.028),(sign*.180,1.147,-.024),
        (sign*.159,1.166,-.071),(sign*.124,1.179,-.108)],.019,chest,vertical=True)
    band("Hardware",[(sign*.119,1.201,-.108),(sign*.124,1.217,-.113)],.022,chest)
band("Pack canvas",[(0,1.359,.192),(0,1.396,.182),(0,1.407,.158),
    (0,1.393,.131),(0,1.365,.131)],.055,chest)

# glTF 2.0 binary layout. Normals are omitted to retain the flat-shaded facets.
binary = bytearray()
views, accessors = [], []


def accessor(values, component, kind, fmt, limits=False):
    while len(binary)%4:
        binary.append(0)
    offset = len(binary)
    for value in values:
        binary.extend(struct.pack("<"+fmt,*value))
    views.append({"buffer":0,"byteOffset":offset,"byteLength":len(binary)-offset})
    info={"bufferView":len(views)-1,"componentType":component,"count":len(values),"type":kind}
    if limits:
        info["min"]=[min(axis) for axis in zip(*values)]
        info["max"]=[max(axis) for axis in zip(*values)]
    accessors.append(info)
    return len(accessors)-1


def linear(c):
    c=int(c,16)/255
    return c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4


nodes = []
for name, parent, position in joints:
    base=joints[parent][2] if parent is not None else (0,0,0)
    nodes.append({"name":name,"translation":[v-b for v,b in zip(position,base)]})
    if parent is not None:
        nodes[parent].setdefault("children",[]).append(len(nodes)-1)

inverse = [(1,0,0,0, 0,1,0,0, 0,0,1,0, -x,-y,-z,1) for _,_,(x,y,z) in joints]
bind = accessor(inverse,5126,"MAT4","16f")
nodes.append({"name":"Commuter","mesh":0,"skin":0})
materials, primitives = [], []
for material, faces in triangles.items():
    color=PALETTE[material]
    materials.append({"name":material,"doubleSided":True,"pbrMetallicRoughness":{
        "baseColorFactor":[linear(color[i:i+2]) for i in (0,2,4)]+[1],
        "metallicFactor":0,"roughnessFactor":.88,
    }})
    vertices=[v for tri in faces for v in tri]
    attributes={
        "POSITION":accessor([v[0] for v in vertices],5126,"VEC3","3f",limits=True),
        "JOINTS_0":accessor([v[1][0] for v in vertices],5121,"VEC4","4B"),
        "WEIGHTS_0":accessor([v[1][1] for v in vertices],5126,"VEC4","4f"),
    }
    primitives.append({"attributes":attributes,"material":len(materials)-1})

gltf={"asset":{"version":"2.0","generator":"Seoul Commute original character"},
      "scene":0,"scenes":[{"nodes":[root,len(nodes)-1]}],"nodes":nodes,
      "meshes":[{"primitives":primitives}],"materials":materials,
      "skins":[{"name":"Commuter deform rig","skeleton":root,"joints":list(range(len(joints))),
                "inverseBindMatrices":bind}],
      "buffers":[{"byteLength":len(binary)}],"bufferViews":views,"accessors":accessors}
scene=json.dumps(gltf,separators=(",",":")).encode()
scene += b" " * (-len(scene)%4)
payload = struct.pack("<II",len(scene),0x4E4F534A)+scene
payload += struct.pack("<II",len(binary),0x004E4942)+binary
OUT.write_bytes(struct.pack("<4sII",b"glTF",2,len(payload)+12)+payload)
print(f"{OUT.name}: {OUT.stat().st_size:,} bytes, "
      f"{sum(map(len,triangles.values())):,} triangles, {len(materials)} materials, "
      f"{len(joints)} bones, 0 textures")

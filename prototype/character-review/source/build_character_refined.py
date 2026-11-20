"""Refine the first commuter mesh while preserving its rest-pose skeleton, using only Python."""
from collections import defaultdict
from math import cos, pi, sin, sqrt
from pathlib import Path
import json
import struct

OUT = Path(__file__).resolve().parents[1] / "model" / "commuter-refined.glb"
PALETTE = {
    "Navy wool": "343e56", "Navy facing": "434e66", "Cotton": "d9d9d2",
    "Trousers": "64666b", "Skin": "bc9079", "Hair": "232124",
    "Detail": "383234", "Leather": "272a30", "Sole": "373a40",
    "Pack canvas": "383539", "Pack trim": "464246", "Hardware": "76695d",
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


def trim(material, points, width, bone, depth):
    """A ribbon with raised surface and wrapped edges, using the existing bone."""
    front = []
    back = []
    for x, y, z in points:
        front.extend(((x-width/2, y, z), (x+width/2, y, z)))
        back.extend(((x-width/2, y, z-depth), (x+width/2, y, z-depth)))
    for i in range(0, len(front)-2, 2):
        panel(material, [front[i],front[i+1],front[i+3],front[i+2]], bone)
        for edge in (i, i+1):
            panel(material, [front[edge], front[edge+2], back[edge+2], back[edge]], bone)
    for i in (0,len(front)-2):
        panel(material, [front[i], back[i], back[i+1], front[i+1]], bone)


def padded_panel(material, points, bone, thickness=.004):
    underside = [(x,y,z+thickness) for x,y,z in points]
    panel(material, points, bone)
    for i, point in enumerate(points):
        j = (i+1) % len(points)
        panel(material, [point,points[j],underside[j],underside[i]], bone)


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


# A straighter coat body with a shallow waist and a beveled hem.
def coat_shape(point, ring, i, a, b):
    x,y,z = point
    if ring in (0,1) and b > .9:
        y += .009
    return x,y,z


loft("Navy wool", [
    (.901,0,.006,.182,.103,weight(hips)), (.913,0,.006,.188,.109,weight(hips)),
    (.955,0,.005,.184,.108,weight(hips)),
    (1.038,0,.002,.169,.101,weight(hips,spine,.6)),
    (1.155,0,0,.171,.108,weight(spine)),
    (1.292,0,0,.192,.119,weight(chest)),
    (1.382,0,.001,.208,.107,weight(chest)),
    (1.428,0,.003,.202,.088,weight(chest)),
    (1.459,0,.004,.148,.077,weight(chest)),
    (1.484,0,.003,.067,.060,weight(chest)),
], power=.80, shape=coat_shape)
loft("Trousers", rows(hips, [
    (.858,0,.009,.119,.050), (.889,0,.009,.158,.079), (.961,0,.008,.156,.095),
]), power=.77)
loft("Skin", [
    (1.459,0,.010,.054,.049,weight(neck)), (1.502,0,.011,.050,.045,weight(neck)),
    (1.544,0,.012,.048,.044,weight(neck,head,.28)),
    (1.580,0,.012,.054,.049,weight(neck,head,.62)),
], 10)
loft("Cotton", rows(chest, [
    (1.471,0,.001,.067,.062), (1.493,0,.004,.060,.058),
]), 12, caps=False)
panel("Cotton", [(-.036,1.485,-.061),(-.034,1.452,-.085),
                 (0,1.405,-.106),(.034,1.452,-.085),(.036,1.485,-.061)], chest)
for sign in (-1,1):
    padded_panel("Navy facing", [
        (sign*.081,1.476,-.047),(sign*.110,1.450,-.069),
        (sign*.077,1.422,-.095),(sign*.105,1.398,-.105),
        (sign*.078,1.365,-.110),(sign*.006,1.243,-.127),
        (sign*.033,1.383,-.115),(sign*.045,1.439,-.082),
        (sign*.042,1.480,-.057),
    ],chest,.005)
    trim("Navy wool",[(sign*.081,1.096,-.100),(sign*.108,1.099,-.092),
         (sign*.135,1.101,-.078)],.014,spine,-.003)
trim("Navy facing",[(.004,.907,-.103),(.004,.962,-.106),(.004,1.038,-.102),
      (.004,1.15,-.110),(.004,1.243,-.126)],.010,spine,-.004)
for y,z in [(1.155,-.112),(1.072,-.107)]:
    loft("Detail",rows(spine,[(y-.004,.013,z,.005,.003),
        (y+.004,.013,z,.005,.003)]),6)

# Face rings describe jaw, cheekbones, brow and skull as one connected mesh.
def face(point, ring, i, a, b):
    x,y,z = point
    if b < -.86:
        z -= [0,.005,.005,.008,.024,.005,.002,0,0][ring] * (-b)**8
    return x,y,z


loft("Skin", rows(head, [
    (1.557,0,-.013,.036,.052), (1.576,0,-.014,.057,.069),
    (1.606,0,-.004,.074,.079), (1.637,0,.003,.081,.076),
    (1.664,0,.003,.086,.078), (1.699,0,.008,.087,.078),
    (1.733,0,.009,.079,.069), (1.764,0,.015,.061,.052),
    (1.782,0,.016,.027,.027),
]),16,shape=face)

def hairline(point, ring, i, a, b):
    x,y,z=point
    if ring == 0:
        y += max(0,-b)*.081 + max(0,-b)*.012*sin(i*.92) + .012*abs(a)**3
        z -= max(0,-b)*.011
    if ring == 2:
        y += x*.16 + .004*cos(i*.9)
    return x,y,z


loft("Hair",rows(head,[
    (1.620,0,.013,.086,.081), (1.719,.001,.009,.093,.086),
    (1.767,-.006,.009,.085,.077), (1.789,-.012,.007,.061,.056),
    (1.801,-.017,.002,.028,.026),
]),16,shape=hairline,caps="top")
for sign in (-1,1):
    loft("Skin", rows(head, [(1.617,sign*.078,.008,.008,.009),
        (1.633,sign*.086,.006,.010,.013),(1.651,sign*.088,.011,.011,.013),
        (1.668,sign*.083,.014,.006,.009)]),8)
    panel("Skin", [(sign*.094,1.635,.006),(sign*.097,1.651,.004),
         (sign*.095,1.658,.014),(sign*.094,1.644,.012)],head)
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
        (.969,sign*.242,-.012,.040,.039,weight(elbow,wrist,.15)),
        (1.016,sign*.244,-.008,.044,.045,weight(elbow)),
        (1.104,sign*.241,0,.051,.052,weight(elbow)),
        (1.185,sign*.234,.006,.056,.058,weight(elbow,arm,.48)),
        (1.299,sign*.222,.008,.059,.063,weight(arm)),
        (1.381,sign*.193,.005,.063,.064,weight(arm,chest,.42)),
        (1.429,sign*.174,.002,.052,.053,weight(chest,arm,.3)),
    ],10)
    loft("Navy facing",[
        (.964,sign*.241,-.012,.038,.036,weight(elbow,wrist,.23)),
        (.970,sign*.242,-.012,.042,.041,weight(elbow,wrist,.15)),
        (.993,sign*.243,-.010,.043,.043,weight(elbow)),
    ],10,caps=False)
    loft("Cotton",rows(wrist,[(.964,sign*.241,-.012,.032,.032),
        (.978,sign*.242,-.011,.037,.033)]),10)
    loft("Skin",rows(wrist,[(.878,sign*.249,-.025,.011,.014),
        (.896,sign*.250,-.021,.014,.023),(.925,sign*.246,-.018,.020,.026),
        (.956,sign*.241,-.013,.024,.025),(.980,sign*.242,-.011,.024,.026)]),10)
    loft("Skin",rows(wrist,[(.909,sign*.226,-.036,.006,.008),
        (.925,sign*.226,-.036,.008,.011),(.943,sign*.232,-.029,.010,.013)]),8)
    loft("Trousers",[
        (.109,sign*.099,.009,.050,.051,weight(shin,foot,.16)),
        (.136,sign*.098,.006,.054,.058,weight(shin,foot,.08)),
        (.165,sign*.097,.008,.053,.053,weight(shin)),
        (.322,sign*.094,.008,.065,.061,weight(shin)),
        (.434,sign*.092,.005,.065,.062,weight(shin,thigh,.18)),
        (.474,sign*.091,-.004,.070,.067,weight(shin,thigh,.43)),
        (.513,sign*.091,-.001,.072,.066,weight(thigh,shin,.41)),
        (.663,sign*.092,.007,.083,.077,weight(thigh)),
        (.801,sign*.087,.008,.089,.087,weight(thigh,hips,.20)),
        (.910,sign*.084,.009,.091,.089,weight(thigh,hips,.60)),
    ],12,power=.86)
    loft("Sole",rows(foot,[(.001,sign*.099,-.046,.049,.123),(.018,sign*.099,-.047,.053,.130),
        (.031,sign*.099,-.046,.055,.132)]),12,power=.70)
    loft("Leather",rows(foot,[(.025,sign*.099,-.045,.053,.130),(.047,sign*.100,-.047,.054,.126),
        (.067,sign*.100,-.033,.050,.112),(.098,sign*.099,.002,.046,.077),
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
    strap = [(sign*.103,1.099,-.090),(sign*.117,1.178,-.097),
        (sign*.132,1.279,-.100),(sign*.139,1.367,-.086),(sign*.137,1.429,-.067),
        (sign*.132,1.463,-.035),(sign*.129,1.472,.002),(sign*.127,1.470,.042),
        (sign*.123,1.439,.073),(sign*.109,1.396,.102),(sign*.088,1.352,.145)]
    band("Pack canvas",strap[4:],.033,chest)
    trim("Pack canvas",strap[:5],.031,chest,-.004)
    band("Pack canvas",[(sign*.113,1.06,.157),(sign*.142,1.074,.101),
        (sign*.168,1.105,.063),(sign*.178,1.128,.028),(sign*.180,1.147,-.024),
        (sign*.159,1.166,-.071),(sign*.124,1.179,-.108)],.019,chest,vertical=True)
    band("Hardware",[(sign*.119,1.201,-.108),(sign*.124,1.217,-.113)],.022,chest)
band("Pack canvas",[(0,1.359,.192),(0,1.396,.182),(0,1.407,.158),
    (0,1.393,.131),(0,1.365,.131)],.055,chest)

# glTF 2.0 binary layout. Use indexed vertices and crease-aware normals.
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
SURFACES = {
    # Roughness, metalness, cosine of the cutoff angle for normal averaging.
    "Navy wool":(.91,0,.63), "Navy facing":(.83,0,.92), "Cotton":(.94,0,.72),
    "Trousers":(.88,0,.67), "Skin":(.70,0,.60), "Hair":(.74,0,.84),
    "Detail":(.85,0,.95), "Leather":(.47,0,.75), "Sole":(.92,0,.80),
    "Pack canvas":(.95,0,.82), "Pack trim":(.76,0,.82), "Hardware":(.46,.35,.95),
}


def unit(v):
    length = sqrt(sum(i*i for i in v))
    return tuple(i/length for i in v) if length > 1e-9 else (0,1,0)


def triangle_normal(face):
    a,b,c = [v[0] for v in face]
    x,y,z = (b[i]-a[i] for i in range(3))
    u,v,w = (c[i]-a[i] for i in range(3))
    return unit((y*w-z*v,z*u-x*w,x*v-y*u))


def indexed_mesh(faces, crease):
    adjacent = defaultdict(list)
    normals = [triangle_normal(face) for face in faces]
    for face, normal in zip(faces, normals):
        for vertex in face:
            adjacent[vertex[0]].append(normal)

    indices, vertices, lookup = [], [], {}
    for face, normal in zip(faces, normals):
        for point, skin in face:
            peers = [n for n in adjacent[point] if sum(a*b for a,b in zip(n,normal)) >= crease]
            vertex_normal = unit(tuple(sum(axis) for axis in zip(*peers)))
            key = (point, skin, tuple(round(v,5) for v in vertex_normal))
            if key not in lookup:
                lookup[key] = len(vertices)
                vertices.append((point,skin,vertex_normal))
            indices.append((lookup[key],))
    return vertices, indices


materials, primitives = [], []
for material, faces in triangles.items():
    color=PALETTE[material]
    roughness, metalness, crease = SURFACES[material]
    materials.append({"name":material,"doubleSided":True,"pbrMetallicRoughness":{
        "baseColorFactor":[linear(color[i:i+2]) for i in (0,2,4)]+[1],
        "metallicFactor":metalness,"roughnessFactor":roughness,
    }})
    vertices, indices = indexed_mesh(faces, crease)
    attributes={
        "POSITION":accessor([v[0] for v in vertices],5126,"VEC3","3f",limits=True),
        "JOINTS_0":accessor([v[1][0] for v in vertices],5121,"VEC4","4B"),
        "WEIGHTS_0":accessor([v[1][1] for v in vertices],5126,"VEC4","4f"),
        "NORMAL":accessor([v[2] for v in vertices],5126,"VEC3","3f"),
    }
    primitives.append({"attributes":attributes,"indices":accessor(indices,5123,"SCALAR","H"),
                       "material":len(materials)-1})

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

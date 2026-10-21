"""
Builds the stylised Sheev character in Blender (headless) and exports a skinned GLB.

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P build_sheev.py -- out/sheev.glb previews
  npx @gltf-transform/cli@4 optimize out/sheev.glb ../../public/3d/sheev.opt.glb \
      --compress meshopt --simplify false --instance false --palette false --texture-compress false

Coordinates below are written in three.js space (x right, y up, z toward the viewer) and
converted to Blender (x, -z, y). Bone positions match REST in src/lab/core/sheev.ts exactly,
so the existing procedural animation + IK can drive this mesh 1:1.
"""
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if len(argv) > 0 else '/tmp/sheev.glb'
PREVIEW = argv[1] if len(argv) > 1 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def T(x, y, z):
    return Vector((x, -z, y))


# ------------------------------------------------------------------ joints
SH_X = 0.23
J = {
    'hips': (0, 0.92, 0), 'spine': (0, 0.98, 0), 'chest': (0, 1.11, 0), 'neck': (0, 1.46, 0), 'head': (0, 1.52, 0),
    'shoulderL': (SH_X, 1.395, 0), 'elbowL': (SH_X, 1.125, 0), 'wristL': (SH_X, 0.88, 0),
    'shoulderR': (-SH_X, 1.395, 0), 'elbowR': (-SH_X, 1.125, 0), 'wristR': (-SH_X, 0.88, 0),
    'hipL': (0.095, 0.86, 0), 'kneeL': (0.095, 0.445, 0), 'ankleL': (0.095, 0.065, 0),
    'hipR': (-0.095, 0.86, 0), 'kneeR': (-0.095, 0.445, 0), 'ankleR': (-0.095, 0.065, 0),
}
TAILS = {
    'hips': J['spine'], 'spine': J['chest'], 'chest': J['neck'], 'neck': J['head'], 'head': (0, 1.82, 0),
    'shoulderL': J['elbowL'], 'elbowL': J['wristL'], 'wristL': (SH_X, 0.76, 0.0),
    'shoulderR': J['elbowR'], 'elbowR': J['wristR'], 'wristR': (-SH_X, 0.76, 0.0),
    'hipL': J['kneeL'], 'kneeL': J['ankleL'], 'ankleL': (0.095, 0.03, 0.16),
    'hipR': J['kneeR'], 'kneeR': J['ankleR'], 'ankleR': (-0.095, 0.03, 0.16),
}
PARENT = {
    'hips': None, 'spine': 'hips', 'chest': 'spine', 'neck': 'chest', 'head': 'neck',
    'shoulderL': 'chest', 'elbowL': 'shoulderL', 'wristL': 'elbowL',
    'shoulderR': 'chest', 'elbowR': 'shoulderR', 'wristR': 'elbowR',
    'hipL': 'hips', 'kneeL': 'hipL', 'ankleL': 'kneeL',
    'hipR': 'hips', 'kneeR': 'hipR', 'ankleR': 'kneeR',
}

# ------------------------------------------------------------------ primitives


def _active():
    return bpy.context.view_layer.objects.active


def ellipsoid(c, r, seg=40):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=1.0, location=T(*c))
    o = _active()
    o.scale = (r[0], r[2], r[1])  # three (x, y, z) radii -> blender (x, depth, height)
    return o


def capsule(a, b, ra, rb, seg=32):
    A, B = T(*a), T(*b)
    d = B - A
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=ra, radius2=rb, depth=d.length, location=(A + B) / 2)
    o = _active()
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    s1 = ellipsoid(a, (ra, ra, ra), seg)
    s2 = ellipsoid(b, (rb, rb, rb), seg)
    return [o, s1, s2]


def torus(c, R, r, tilt_x=0.0):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=48, minor_segments=16, location=T(*c))
    o = _active()
    o.rotation_euler = (tilt_x, 0, 0)
    return o


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(objs) > 1:
        bpy.ops.object.join()
    o = _active()
    o.name = name
    o.data.name = name
    return o


def apply_mod(o, m):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)


def fuse(o, voxel=0.006, smooth=8, factor=0.7, faces=6000):
    m = o.modifiers.new('remesh', 'REMESH')
    m.mode = 'VOXEL'
    m.voxel_size = voxel
    apply_mod(o, m)
    if smooth:
        s = o.modifiers.new('smooth', 'SMOOTH')
        s.factor = factor
        s.iterations = smooth
        apply_mod(o, s)
    tris = sum(len(pl.vertices) - 2 for pl in o.data.polygons)
    if faces and tris > faces:
        d = o.modifiers.new('dec', 'DECIMATE')
        d.ratio = faces / tris
        apply_mod(o, d)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_smooth()
    return o


def material(name, rgb, rough=0.8):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (*rgb, 1)
        bsdf.inputs['Roughness'].default_value = rough
    m.diffuse_color = (*rgb, 1)
    return m


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


MATS = {
    'shirt': material('shirt', srgb('#6e6f48')),
    'pants': material('pants', srgb('#2b3141')),
    'skin': material('skin', srgb('#a5694a')),
    'head': material('head', srgb('#a86c4c'), 0.45),
    'beard': material('beard', srgb('#1c1512'), 0.95),
    'shoe': material('shoe', srgb('#f2efe9'), 0.6),
    'sole': material('sole', srgb('#d8d1c5'), 0.8),
}


def set_mat(o, name):
    o.data.materials.clear()
    o.data.materials.append(MATS[name])


# ------------------------------------------------------------------ garments
parts = []
# shirt: olive overshirt, sleeves rolled to mid-forearm, soft collar
s = []
s.append(ellipsoid((0, 1.2, 0.0), (0.168, 0.27, 0.121)))       # torso core
s.append(ellipsoid((0, 1.348, -0.004), (0.214, 0.084, 0.114)))  # shoulder yoke
s.append(ellipsoid((0, 0.985, 0.004), (0.17, 0.09, 0.125)))     # waist / hem
for sx in (1, -1):
    s.append(ellipsoid((sx * 0.214, 1.36, 0.0), (0.06, 0.062, 0.062)))
    s += capsule((sx * SH_X, 1.368, 0.0), (sx * SH_X, 1.13, 0.0), 0.062, 0.054)
    s += capsule((sx * SH_X, 1.13, 0.0), (sx * SH_X, 1.026, 0.0), 0.054, 0.052)
    s.append(torus((sx * SH_X, 1.024, 0.0), 0.053, 0.013))
shirt = fuse(join(s, 'shirt'), voxel=0.0055, smooth=8, factor=0.7, faces=None)

# open collar: a V cut into the front of the neckline
def v_wedge():
    bm_ = bmesh.new()
    top_y, bot_y, half = 1.47, 1.315, 0.07
    pts2 = [(-half, top_y), (half, top_y), (0.0, bot_y)]
    vs = []
    for z in (0.02, 0.3):
        for (x, y) in pts2:
            vs.append(bm_.verts.new(T(x, y, z)))
    bm_.faces.new((vs[0], vs[1], vs[2]))
    bm_.faces.new((vs[5], vs[4], vs[3]))
    for i in range(3):
        j = (i + 1) % 3
        bm_.faces.new((vs[i], vs[i + 3], vs[j + 3], vs[j]))
    me = bpy.data.meshes.new('wedge')
    bm_.normal_update()
    bm_.to_mesh(me)
    bm_.free()
    ob = bpy.data.objects.new('wedge', me)
    scene.collection.objects.link(ob)
    return ob

wedge = v_wedge()
# neck hole so the collar sits open around the neck
bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=0.075, depth=0.3, location=T(0, 1.47, 0.0))
neck_hole = _active()
for cutter in (wedge, neck_hole):
    b_ = shirt.modifiers.new('cut', 'BOOLEAN')
    b_.operation = 'DIFFERENCE'
    b_.object = cutter
    try:
        b_.solver = 'EXACT'
    except Exception:
        pass
    apply_mod(shirt, b_)
    bpy.data.objects.remove(cutter, do_unlink=True)
_dd = shirt.modifiers.new('dec', 'DECIMATE')
_dd.ratio = min(1.0, 4800 / sum(len(pl.vertices) - 2 for pl in shirt.data.polygons))
apply_mod(shirt, _dd)
bpy.ops.object.select_all(action='DESELECT'); shirt.select_set(True); bpy.context.view_layer.objects.active = shirt
bpy.ops.object.shade_smooth()
set_mat(shirt, 'shirt')
parts.append(shirt)

# the black tee you see through the V
tee = fuse(join([ellipsoid((0, 1.3, 0.0), (0.15, 0.17, 0.112)), ellipsoid((0, 1.4, 0.0), (0.085, 0.06, 0.08))], 'tee'), voxel=0.006, smooth=4, factor=0.5, faces=900)
MATS['tee'] = material('tee', srgb('#1f1f21'))
set_mat(tee, 'tee')
parts.append(tee)

# collar points lying open on the collarbones
flaps = []
for sx in (1, -1):
    f_ = ellipsoid((sx * 0.066, 1.437, 0.068), (0.05, 0.011, 0.034), seg=24)
    f_.rotation_euler = (math.radians(-28), math.radians(sx * -18), math.radians(sx * 32))
    flaps.append(f_)
collar = fuse(join(flaps, 'collar'), voxel=0.003, smooth=3, factor=0.5, faces=700)
MATS['collar'] = material('collar', srgb('#5d5e3c'))
set_mat(collar, 'collar')
parts.append(collar)

# button placket + buttons down the front
plk = fuse(join([ellipsoid((0, 1.11, 0.123), (0.014, 0.205, 0.006), seg=16)], 'placket'), voxel=0.003, smooth=2, factor=0.4, faces=400)
set_mat(plk, 'collar')
parts.append(plk)
btns = [ellipsoid((0, y, 0.13), (0.0075, 0.0075, 0.004), seg=12) for y in (1.27, 1.17, 1.07, 0.97)]
buttons = join(btns, 'buttons')
MATS['button'] = material('button', srgb('#2a2620'))
set_mat(buttons, 'button')
parts.append(buttons)

# trousers: relaxed straight leg
p = []
p.append(ellipsoid((0, 0.905, 0.0), (0.168, 0.115, 0.122)))
for sx in (1, -1):
    p += capsule((sx * 0.098, 0.875, 0.0), (sx * 0.097, 0.46, 0.006), 0.088, 0.074)
    p.append(ellipsoid((sx * 0.097, 0.445, 0.008), (0.075, 0.075, 0.075)))
    p += capsule((sx * 0.097, 0.445, 0.0), (sx * 0.097, 0.1, 0.0), 0.073, 0.067)
pants = fuse(join(p, 'pants'), voxel=0.0055, smooth=7, factor=0.65, faces=3500)
set_mat(pants, 'pants')
parts.append(pants)

# skin: neck, forearms, hands (mitten + thumb)
k = []
k += capsule((0, 1.37, 0.0), (0, 1.6, 0.004), 0.071, 0.067)
for sx in (1, -1):
    x = sx * SH_X
    k += capsule((x, 1.035, 0.0), (x, 0.885, 0.0), 0.051, 0.043)
    k.append(ellipsoid((x + sx * 0.002, 0.826, 0.006), (0.029, 0.063, 0.052)))
    k.append(ellipsoid((x + sx * 0.002, 0.762, 0.015), (0.027, 0.047, 0.049)))
    k += capsule((x - sx * 0.004, 0.857, 0.04), (x - sx * 0.009, 0.802, 0.062), 0.017, 0.0145)
skin = fuse(join(k, 'skin'), voxel=0.0038, smooth=6, factor=0.6, faces=3500)
set_mat(skin, 'skin')
parts.append(skin)

# head: bald cranium, cheeks, jaw, button nose, ears
h = []
h.append(ellipsoid((0, 1.69, -0.006), (0.146, 0.168, 0.158)))
h.append(ellipsoid((0, 1.62, 0.02), (0.13, 0.11, 0.13)))
h.append(ellipsoid((0, 1.56, 0.04), (0.104, 0.07, 0.098)))
h.append(ellipsoid((0, 1.646, 0.156), (0.024, 0.021, 0.024)))
h.append(ellipsoid((0, 1.672, 0.15), (0.012, 0.022, 0.012)))
for sx in (1, -1):
    e = ellipsoid((sx * 0.145, 1.66, -0.006), (0.017, 0.037, 0.027))
    e.rotation_euler = (0, 0, sx * 0.2)
    h.append(e)
head = fuse(join(h, 'head'), voxel=0.0032, smooth=9, factor=0.7, faces=None)  # high-res for now
set_mat(head, 'head')
parts.append(head)

# beard: grown from the face surface (lower face + jaw, moustache under the nose)
beard = head.copy()
beard.data = head.data.copy()
beard.name = 'beard'
beard.data.name = 'beard'
scene.collection.objects.link(beard)
# now decimate the head itself
_d = head.modifiers.new('dec', 'DECIMATE')
_d.ratio = 4000 / sum(len(pl.vertices) - 2 for pl in head.data.polygons)
apply_mod(head, _d)
bm = bmesh.new()
bm.from_mesh(beard.data)
C = T(0, 1.66, 0.0)


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


kill = []
for v in bm.verts:
    q = v.co - C
    front = -q.y / 0.16            # blender -y == three +z (front of the face)
    up = q.z / 0.16
    side = abs(q.x) / 0.146         # 0 at the centre line, 1 at the ear
    # beard line by sideways distance: moustache right under the nose, curling down around the
    # mouth corners, then a diagonal cheek line up to the sideburns
    if side < 0.24:
        boundary = -0.2
    elif side < 0.4:
        boundary = -0.2 - 0.11 * smoothstep(0.24, 0.4, side)
    else:
        boundary = -0.31 + 0.37 * smoothstep(0.4, 0.95, side)
    keep = up < boundary and front > -0.32
    # a smiling mouth gap between moustache and chin beard (corners lift, gap tapers)
    if keep and front > 0.55 and side < 0.34:
        t = side / 0.34
        top = -0.35 + 0.05 * t * t
        bot = -0.43 + 0.1 * t * t
        if bot < up < top:
            keep = False
    if not keep:
        kill.append(v)
bmesh.ops.delete(bm, geom=kill, context='VERTS')
bm.to_mesh(beard.data)
bm.free()
sol = beard.modifiers.new('sol', 'SOLIDIFY')
beard.data.update()
sol.thickness = 0.009
sol.offset = 1.0
apply_mod(beard, sol)
sm = beard.modifiers.new('sm', 'SMOOTH')
sm.factor = 0.5
sm.iterations = 3
apply_mod(beard, sm)
_bd = beard.modifiers.new('dec', 'DECIMATE')
_bd.ratio = min(1.0, 3200 / sum(len(pl.vertices) - 2 for pl in beard.data.polygons))
apply_mod(beard, _bd)
bpy.ops.object.select_all(action='DESELECT')
beard.select_set(True)
bpy.context.view_layer.objects.active = beard
bpy.ops.object.shade_smooth()
set_mat(beard, 'beard')
parts.append(beard)

# shoes: rounded sneakers + separate sole
for side, sx in (('L', 1), ('R', -1)):
    x = sx * 0.095
    up = [ellipsoid((x, 0.06, 0.045), (0.062, 0.055, 0.13)), ellipsoid((x, 0.05, 0.13), (0.057, 0.046, 0.066)), ellipsoid((x, 0.07, -0.045), (0.058, 0.058, 0.06))]
    shoe = fuse(join(up, 'shoe' + side), voxel=0.004, smooth=6, factor=0.6, faces=900)
    set_mat(shoe, 'shoe')
    sole = fuse(join([ellipsoid((x, 0.016, 0.047), (0.066, 0.018, 0.15))], 'sole' + side), voxel=0.004, smooth=3, factor=0.5, faces=400)
    set_mat(sole, 'sole')
    parts += [shoe, sole]

# ------------------------------------------------------------------ armature
arm_data = bpy.data.armatures.new('rig')
arm = bpy.data.objects.new('rig', arm_data)
scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name in J:
    b = arm_data.edit_bones.new(name)
    b.head = T(*J[name])
    b.tail = T(*TAILS[name])
    b.roll = 0
for name, par in PARENT.items():
    if par:
        arm_data.edit_bones[name].parent = arm_data.edit_bones[par]
        arm_data.edit_bones[name].use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')


def skin_auto(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    # verify every vertex got a weight
    missing = 0
    for v in o.data.vertices:
        if not any(g.weight > 0.001 for g in v.groups):
            missing += 1
    return missing


def skin_rigid(o, bone):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_NAME')
    g = o.vertex_groups.get(bone) or o.vertex_groups.new(name=bone)
    g.add([v.index for v in o.data.vertices], 1.0, 'REPLACE')


def nearest_bone_weights(o):
    """Fallback: smooth distance-to-segment weights over the two closest bones."""
    for g in list(o.vertex_groups):
        o.vertex_groups.remove(g)
    segs = {n: (T(*J[n]), T(*TAILS[n])) for n in J}
    groups = {n: o.vertex_groups.new(name=n) for n in J}
    for v in o.data.vertices:
        p = o.matrix_world @ v.co
        ds = []
        for n, (a, b) in segs.items():
            ab = b - a
            t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
            ds.append(((p - (a + ab * t)).length, n))
        ds.sort()
        (d0, n0), (d1, n1) = ds[0], ds[1]
        w0 = 1.0 / max(d0, 1e-4) ** 4
        w1 = 1.0 / max(d1, 1e-4) ** 4
        s_ = w0 + w1
        groups[n0].add([v.index], w0 / s_, 'REPLACE')
        groups[n1].add([v.index], w1 / s_, 'REPLACE')


report = {}
for o in (shirt, pants, skin, tee, collar, plk, buttons):
    miss = skin_auto(o)
    if miss > len(o.data.vertices) * 0.002:
        nearest_bone_weights(o)
        report[o.name] = f'fallback weights ({miss} unweighted)'
    else:
        report[o.name] = f'heat weights ok ({miss} unweighted)'
skin_rigid(head, 'head')
skin_rigid(beard, 'head')
for side in ('L', 'R'):
    skin_rigid(bpy.data.objects['shoe' + side], 'ankle' + side)
    skin_rigid(bpy.data.objects['sole' + side], 'ankle' + side)

for k_, v_ in report.items():
    print('[weights]', k_, v_)
for o in parts:
    print('[mesh]', o.name, len(o.data.vertices), 'verts', len(o.data.polygons), 'faces')

# ------------------------------------------------------------------ export
for o in parts:
    o.name = 'm_' + o.name
os.makedirs(os.path.dirname(OUT), exist_ok=True)
kw = dict(filepath=OUT, export_format='GLB', export_skins=True, export_animations=False, export_yup=True, export_texcoords=False, export_materials='EXPORT')
try:
    bpy.ops.export_scene.gltf(**kw)
except TypeError as e:
    print('[export] retry without optional args:', e)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB')
print('[export] wrote', OUT, os.path.getsize(OUT), 'bytes')

# ------------------------------------------------------------------ previews
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    scene.render.engine = 'BLENDER_WORKBENCH'
    shading = scene.display.shading
    shading.light = 'STUDIO'
    shading.color_type = 'MATERIAL'
    shading.show_cavity = True
    shading.show_shadows = True
    scene.render.resolution_x = 700
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    world = bpy.data.worlds.new('w')
    scene.world = world
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 85
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    target = Vector((0, 0, 1.0))
    for label, ang in (('front', 0), ('three_quarter', 35), ('side', 90)):
        a = math.radians(ang)
        cam.location = Vector((math.sin(a) * 6.2, -math.cos(a) * 6.2, 1.05))
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(PREVIEW, f'preview_{label}.png')
        bpy.ops.render.render(write_still=True)
    # close-up of the head
    cam_data.lens = 120
    cam.location = Vector((0.9, -2.2, 1.68))
    cam.rotation_euler = (Vector((0, 0, 1.64)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x = 700
    scene.render.resolution_y = 700
    scene.render.filepath = os.path.join(PREVIEW, 'preview_head.png')
    bpy.ops.render.render(write_still=True)
    print('[preview] done')

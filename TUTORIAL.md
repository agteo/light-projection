# Light Mapper tutorial — project a brand logo onto an object

This walkthrough covers a simple first project: put a company logo onto a real-world surface (a box, pedestal, wall panel, or product). It also explains how the mapping technology works under the hood.

Use **Chrome or Edge** on a laptop or desktop. Mobile browsers are not supported in v1.

---

## What you need

| Item | Notes |
|------|--------|
| Computer | Laptop/desktop with an HDMI (or USB‑C → HDMI) output |
| Projector | Any HDMI projector; set as an **extended** display, not mirrored |
| Logo file | PNG or JPG (transparent PNG works best on dark surfaces) |
| Surface | Preferably flat or gently planar — a box face, sign board, or wall patch |
| Room | Dim enough that the projected image is visible |

Optional: a printed logo or tape marks on the object help you judge alignment while corner-pinning.

---

## Part 1 — Hardware setup

1. Connect the projector and extend the desktop (macOS: **System Settings → Displays → Use as → Extended display**; Windows: **Project → Extend**).
2. Open Light Mapper in the browser (your Vercel URL, or local `npm run dev` / `npx serve dist`).
3. In the editor, click **Open output**. Allow popups if the browser blocks the window.
4. Drag the output window onto the projector screen.
5. Fullscreen it (`Fullscreen` button, `F`, or `F11`). The projector should show black (or the default zone) with no browser chrome.

You now have two windows:

- **Editor** (main screen) — controls, zone handles, source panel.
- **Output** (projector) — the clean composite the audience sees.

Both stay in sync over a same-origin `BroadcastChannel`. Keep them on the **same site URL**.

---

## Part 2 — Sample project: logo on a box

Goal: map a brand logo onto the front face of a cardboard box (or similar rectangular surface).

### 1. Name the project

In the top bar, change **Project** from `Untitled` to something like `Brand logo — box front`.

### 2. Focus and find the surface

1. In **Output preview**, click **White** — the projector floods light so you can focus the lens and spot the box.
2. Place the box where the light hits it cleanly (minimize keystone by aiming the projector as square-on as practical; Light Mapper will correct the rest).
3. Switch to **Test pattern** — a grid helps you see distortion on the physical face.
4. When ready to place content, switch back to **Live**.

### 3. Create and size a zone

A **zone** is a four-corner quad. Content is drawn in a unit square, then warped to those corners.

1. Use the default zone, or double-click empty preview space to add one.
2. In **Zones**, rename it to `Box front`.
3. Drag the whole zone roughly over where the box appears in the preview (drag inside the quad to move; Shift-drag to scale).

The preview is a stand-in for the full projector frame. Align as if looking through the projector’s eye.

### 4. Corner-pin to the object

1. Drag each **corner handle** to a corner of the physical box face (as seen through the projection).
2. Use **edge midpoints** to stretch sides without losing the opposite corners.
3. Click a corner (it highlights), then nudge with **arrow keys** (1px) or **Shift+arrows** (10px).
4. Flip between **Test pattern** and **Live** while adjusting until the grid (or logo) sits flush on the face.

Tips:

- Keep the quad **convex** (no bow-tie / crossed corners) or the warp is invalid.
- If the box face is a trapezoid in the camera-of-the-projector view, that is expected — the warp is built for that.
- Press **B** for blackout anytime you need to check the room without projection.

### 5. Assign the logo

1. Select the zone.
2. Open **Source**.
3. Set **Type** to **Image**.
4. Choose your logo file.
5. Set **Fit**:
   - **Contain** — whole logo visible (letterboxing inside the zone).
   - **Cover** — fills the zone (may crop).
   - **Stretch** — fills exactly (can distort the logo).
6. Raise **Feather** slightly (e.g. 4–12px) to soften hard edges on imperfect surfaces.
7. Leave **Blend** on **normal** unless you are stacking zones.

You should see the logo warped onto the box in both the editor preview and the output window.

### 6. Polish

| Control | When to use it |
|---------|----------------|
| Opacity | Dim the logo so it feels printed on the object |
| Feather | Soften edges on textured or slightly uneven faces |
| White / Test pattern | Re-check focus and alignment after moving the box |
| Export JSON | Save a backup of zone corners and settings (media filenames only) |

After a browser refresh, **re-import the logo file** — object URLs do not persist; the app remembers the filename and shows a missing-media placeholder until you pick the file again.

### 7. Optional extras

- **Second face:** Add another zone, corner-pin the top or side of the box, assign a different image or a solid brand color.
- **Subtle motion:** Switch Type to **Effect** (e.g. Solid pulse) behind a semi-transparent logo zone (z-order ↑↓).
- **Show control:** Map **Blackout** to a MIDI pad (**MIDI → Learn**) for a hard cut.

---

## Part 3 — How the mapping technology works

### The problem

A projector throws a rectangular image onto the world. Real objects are rarely aligned with that rectangle: a box face appears as a trapezoid, a wall at an angle stretches, and corners do not match pixel edges. Projection mapping solves this by **warping** content so that, after it travels through the projector and hits the object, it looks correct on the surface.

### Zones as quads

Each zone is defined by four corners in output space (normalized coordinates covering the full projector frame):

```text
TL -------- TR
|            |
|   content  |
|            |
BL -------- BR
```

You edit those corners until they coincide with the physical corners of the target surface, as seen from the projector.

### Homography (projective warp)

Light Mapper does **not** fake the warp with two stretched triangles (that causes a visible diagonal “seam” under perspective). Instead it uses a **homography**: a 3×3 projective matrix with 8 degrees of freedom that maps any plane to any other plane in projective space.

Concretely:

1. Content (logo, video, effect) is authored in a **unit square** (0–1 UV).
2. On the CPU, the app solves a homography \(H\) that maps that unit square to the zone’s four corners (four point correspondences).
3. That matrix is uploaded to the GPU as a uniform.
4. In the fragment shader, each pixel of the projected quad is mapped **back** through \(H^{-1}\) to sample the source texture with perspective-correct coordinates (divide by \(w\)).

Because every sample uses the projective map, straight lines in the source stay straight on a planar surface, and a checkerboard test pattern remains a clean grid even when the zone is an extreme trapezoid.

### Why “planar” matters

A single homography assumes the target is (approximately) a **flat plane**. That matches a box face, a poster, a screen, or a wall panel. Curved or deeply 3D surfaces need multiple small planar zones (or a different technique). Use **Split 2×2 / 3×3** to break one quad into a grid when one plane is not enough.

### Compositing

Zones are drawn in **z-order**. Each can apply:

- **Opacity** — overall gain  
- **Feather** — soft falloff near quad edges in UV space  
- **Blend modes** — normal / add / multiply / screen via framebuffer blending  

The editor and the output window each run their **own WebGL render loop**. The editor sends project state (zones, sources, blackout, mode) over `BroadcastChannel`; the output window renders independently so the projector path stays smooth.

### Modes that help calibration

| Mode | Role |
|------|------|
| **Live** | Real content (effects, images, video) |
| **Test pattern** | Alignment grid — verify perspective and pin accuracy |
| **White** | Full-field light — focus lens and find surfaces |
| **Blackout (B)** | Immediate dark — safety and cueing |

### What this stack is (and is not)

**Is:** a local, browser-based corner-pin mapper for HDMI projectors; good for logos, product faces, stage props, and simple multi-quad layouts.

**Is not (v1):** multi-projector soft-edge blending, true 3D mesh mapping, AirPlay/casting, or cloud-synced media. Media and MIDI stay on the machine running the browser.

---

## Quick checklist (logo on object)

- [ ] Projector set to **Extend**, not Mirror  
- [ ] Output window on projector, fullscreen  
- [ ] Zone corners pinned to the physical face  
- [ ] Source = Image, logo imported, fit chosen  
- [ ] Feather/opacity adjusted for the surface  
- [ ] Test pattern checked for straight lines / no seam  
- [ ] Project JSON exported as backup; logo file saved for re-import after reload  

---

## See also

- [README.md](./README.md) — setup, shortcuts, audio/MIDI notes  
- [SPEC.md](./SPEC.md) — product requirements and renderer rules  

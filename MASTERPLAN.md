---
agent: devin-local
session: befitting-horse
created: 2026-08-12T01:30:07Z
updated: 2026-08-12T05:30:00Z
---

# Masterplan: Rooted in Christ — Network & Wayfinder

## 1. Product Vision

Rooted in Christ is a Bible-study application where the **Network** is not just a cross-reference graph, but a navigable 3D space and a **Wayfinder** that lets users:

1. Explore the biblical text as a connected graph (verses, themes, people, places, books, chapters).
2. See the chronological paths that biblical figures took through Scripture.
3. Visualize their own journey through Scripture (bookmarks, notes, highlights, memories).
4. Attach rich data to each stop on that journey (notes, photos, tags, mood).
5. Share those stops with friends in the future (private, friends, public).

The 3D Network is the primary high-fidelity surface. The Wayfinder is the storytelling layer on top of it.

## 2. What Is Already Built

### 2.1 3D Network (`NetworkThreeScene.tsx`)

- Three.js + React Three Fiber renderer.
- `InstancedMesh` nodes with one draw call.
- Batched `LineSegments` edges.
- `OrbitControls` with damping, pan, zoom, rotate.
- Camera fly-to and distance-based hierarchy (books → chapters → verses).
- `Html` labels for selected/hovered/center/themes/related/books/people/places.
- Runtime LOD/quality detection (`high`/`medium`/`low`) that caps DPR, geometry detail, and label count.
- Lazy-loaded chunk to keep the main bundle smaller.
- Node/edge factory registry (`graphFactories.ts`) for extensibility.

### 2.2 Node Kinds

| Kind | Meaning |
|------|---------|
| `center` | Active verse |
| `related` | Cross-reference matches |
| `theme` | Shared-topic clusters |
| `echo` | Cross-reference of cross-references |
| `ambient` | Bible hierarchy (books/chapters/verses) |
| `book` | Bible book |
| `chapter` | Chapter of a book |
| `person` | Biblical character |
| `place` | Biblical location |
| `event` | A moment in a character's path |
| `userWaypoint` | A bookmark/highlight/note the user has saved |

### 2.3 Wayfinder Path Rendering

- `AnimatedPath` component: `Line` + an animated sphere that travels from point to point.
- Person paths: when a `person` node is selected, the character's `event` sequence is shown.
- User journey: a toggle in the Network tab plots bookmarks/highlights chronologically and draws the path through Scripture.

### 2.4 Data Flow

```
App.tsx
  ├─ buildNetworkNodes(centerVerse, relatedMatches, themes, people, places)
  ├─ buildNetworkEdges(...)
  ├─ buildBibleHierarchyNodes(allVerses) → ambientBible
  ├─ personPath (from selected character)
  ├─ userJourneyNodes / userJourneyPaths (from bookmarks)
  ├─ sceneNodes = [...ambient, ...local, ...personPath, ...userJourneyNodes]
  ├─ scenePaths = [...personPaths, ...userJourneyPaths]
  └─ NetworkThreeScene
       ├─ InstancedMesh (nodes)
       ├─ EdgeSegments
       ├─ LabelRenderer
       ├─ CameraRig
       └─ AnimatedPath[]
```

## 3. What We Learned

### 3.1 What Works

- `InstancedMesh` + `LineSegments` is fast enough for the current data sizes.
- `Html` labels from `@react-three/drei` are readable and performant up to ~18 labels.
- Users understand the graph once it is colored, labeled, and the camera focuses.
- Camera-driven hierarchy (books → chapters → verses) is seamless.

### 3.2 What Needs Work

- The Wayfinder is currently a toggle inside the **Network** tab. It should be a first-class experience.
- User waypoints come only from `bookmarks`. Real notes/photos/memories are not yet supported.
- There is no dedicated Wayfinder list/detail view.
- Sharing is not implemented.
- `NetworkThreeScene` still imports `OrbitControls`, `Line`, `Html`, `InstancedMesh`, etc. directly. Further code-splitting and factory decoupling is possible.

## 4. Architecture

### 4.1 Core Principles

1. **Lazy by default**: heavy 3D code is only loaded for the Network/Wayfinder surface.
2. **Factory-first**: new node/edge kinds are added via `graphFactories.ts` and `buildNetworkNodes`/`buildNetworkEdges`, not by touching the renderer.
3. **Camera drives disclosure**: the 3D scene reveals more detail as the user zooms.
4. **User data is local-first, cloud-optional**: bookmarks, notes, memories live in `localStorage`/`IndexedDB` and sync to the cloud when possible.
5. **Social is an extension, not a foundation**: sharing happens after user data is robust.

### 4.2 Directory Layout (future)

```
web/src
  ├─ graphFactories.ts          (already exists)
  ├─ NetworkThreeScene.tsx      (already exists)
  ├─ NetworkThreeScene/
  │   ├─ CameraRig.tsx
  │   ├─ NodeInstancer.tsx
  │   ├─ EdgeSegments.tsx
  │   ├─ LabelRenderer.tsx
  │   ├─ AnimatedPath.tsx
  │   └─ LODController.tsx
  ├─ wayfinder/
  │   ├─ WayfinderTab.tsx
  │   ├─ WayfinderCard.tsx
  │   ├─ WayfinderTimeline.tsx
  │   ├─ useUserJourney.ts
  │   ├─ useBiblicalPaths.ts
  │   └─ shareMemory.ts
  └─ storage.ts                 (already the local-first source of truth)
```

## 5. Implementation Phases

### Phase 1 — 3D Foundation (Shipped)

1.1. Replace custom WebGL `NetworkScene` with `NetworkThreeScene` (R3F).
1.2. Render `center`/`related`/`theme`/`echo`/`ambient`/`book`/`chapter` nodes and edges.
1.3. Add `OrbitControls`, selection, hover, labels, camera fly-to.
1.4. Add LOD/quality auto-detection.
1.5. Lazy-load the graph chunk and remove unused Cytoscape/force-graph files.
1.6. Add `person` and `place` nodes.
1.7. Add camera-driven book/chapter/verse hierarchy.
1.8. Create `graphFactories.ts` for colors, sizes, target distances.

### Phase 2 — Biblical Wayfinder (Current)

2.1. Add `event` node kind and `AnimatedPath` renderer.
2.2. Generate `personPath` for selected biblical characters.
2.3. Animate a sphere along the path.
2.4. Add a **Wayfinder** tab or section where the user can pick a biblical figure from a list and see the path.
2.5. Allow play/pause/step controls on the path.
2.6. Show `event` detail cards (label, place, date, passage).

### Phase 3 — Personal Wayfinder (Next)

3.1. Extend `Note` and `Memory` data model (timestamp, verseId, text, photo, tags, mood).
3.2. Add in-app note/memory creation from the Reader and Network.
3.3. Replace `userJourneyNodes` from bookmarks to `userWaypoint` from the new `Memory` store.
3.4. Build a `WayfinderTab` with a timeline and a 3D view.
3.5. Filter by date range, book, tag, mood.
3.6. Add the ability to tap a stop and open a detail card.

### Phase 4 — Social Sharing (Future)

4.1. Add `shareLevel` to memories (`private`, `friends`, `public`).
4.2. Add a `friends` list and cloud group.
4.3. When a friend opens a passage, fetch shared memories for that verse.
4.4. Render shared friend notes/memories as `friendWaypoint` nodes in the Network.
4.5. Allow comments/reactions on shared memories.

### Phase 5 — Full Biblical Knowledge Graph (Future)

5.1. Add `originalWord` (Hebrew/Greek lemma) nodes and edges.
5.2. Add `topic` and `doctrine` nodes.
5.3. Pre-compute cross-reference graph for all 31k verses and stream in chunks.
5.4. Add server-side or WASM graph analysis for the full data set.
5.5. Add a 2D fallback for very low-end devices.

## 6. Data Model

### 6.1 `Memory` (new)

```ts
interface Memory {
  id: string
  userId?: string
  verseId: string
  type: 'highlight' | 'note' | 'photo' | 'prayer' | 'bookmark'
  createdAt: string
  updatedAt?: string
  content?: string
  color?: string
  photoUrl?: string
  tags: string[]
  mood?: 'joy' | 'peace' | 'sorrow' | 'wonder' | 'conviction' | 'gratitude'
  shareLevel: 'private' | 'friends' | 'public'
}
```

### 6.2 `BiblicalPath` (new)

```ts
interface BiblicalPath {
  characterId: string
  label: string
  color: [number, number, number]
  stops: PathStop[]
}

interface PathStop {
  order: number
  verseId?: string
  placeId?: string
  eventLabel: string
  approxDate?: string
}
```

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| 3D performance degrades with many user memories | Cap waypoints to the most recent N; use frustum culling and LOD. |
| Photos bloat bundle/storage | Store photo URLs, not base64; compress and use cloud storage. |
| Privacy violations on shared memories | `shareLevel` default is `private`; public only after explicit opt-in. |
| Full 31k graph is too large | Chunk data; stream only visible subsets; keep WASM/server as an option. |
| Camera-driven hierarchy causes motion sickness | Keep `OrbitControls` damping; allow user to disable auto-focus. |

## 8. Acceptance Criteria

### Phase 1
- [x] `npm run build` passes.
- [x] Web deploy and mobile install succeed.
- [x] 60 FPS on high-end desktop.
- [x] 30+ FPS on Samsung SM-F966U.
- [x] Clicking a person/place/theme/verse focuses and highlights.
- [x] Book/chapter/verse hierarchy is navigable.

### Phase 2
- [ ] Selecting a person shows an animated path of events.
- [ ] A dedicated Wayfinder surface lets the user browse biblical figures.
- [ ] Play/pause/step controls work on the path.

### Phase 3
- [ ] User can add a note/memory to a verse.
- [ ] Wayfinder shows the user's chronological Scripture journey.
- [ ] The user can filter, inspect, and delete stops.

### Phase 4
- [ ] A user can set a memory to `friends` or `public`.
- [ ] A friend opening the same passage sees the shared memory.
- [ ] The friend can see the shared stop in the 3D graph.

## 9. First Step After Approval

1. Move `AnimatedPath` and path rendering into `NetworkThreeScene/AnimatedPath.tsx`.
2. Create a `WayfinderTab` component and add it to the tab bar.
3. In `WayfinderTab`, list biblical characters; selecting one sets the Network focus to that person and renders their path.
4. Add play/pause/step controls to the `WayfinderTab` sidebar.

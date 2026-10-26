// A map's physics collision (the PHYSCOLLIDE lump's solids) made by GMod's own vphysics, as vbsp makes it (Source
// SDK 2013 src/utils/vbsp/ivp.cpp): each solid is a list of convex brushes given as planes, made into one collide
// by IPhysicsCollision and written out in vphysics' own binary format, which nothing documents. Ported from
// stevenlafl's tools/map/vcollide.cpp (Linux, 32-bit vphysics_srv.so); here also Windows' 64-bit vphysics.dll.
// Built and run by src/source/vcollide.mjs. Build it for the DLL's machine (x64 for bin/win64), with the
// compiler Valve's was built with (MSVC on Windows), so the interface's slots are where the DLL has them.
//
// A triangle of the world's collide takes the material of the brush side it lies on, as vbsp's
// ConvertWorldBrushesToPhysCollide sets it: an index into the materialtable the lump's text gives (0 the
// solid's own surfaceprop). stevenlafl's, as they found it.
//
//   vcollide <vphysics library> <in> <out>
// in:  int solids; each: int kind (0 the world's static solid, 1 a brush entity's), int convexes; each
//      convex: int planes, float mins[3], maxs[3], then planes x { float nx, ny, nz, dist; int material }
//      facing out of it
// out: for each solid: int bytes, the collide, float volume (cubic inches)
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <map>
#include <vector>
#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

typedef void *(*CreateInterfaceFn)(const char *name, int *ret);
struct CPhysConvex;
struct CPhysCollide;
struct Vector {
  float x, y, z;
};

// ICollisionQuery, in vphysics_interface.h's order
class ICollisionQuery {
public:
  virtual ~ICollisionQuery() {}
  virtual int ConvexCount() = 0;
  virtual int TriangleCount(int convex) = 0;
  virtual unsigned int GetGameData(int convex) = 0;
  virtual void GetTriangleVerts(int convex, int triangle, Vector *verts) = 0;
  virtual void SetTriangleVerts() = 0;
  virtual int GetTriangleMaterialIndex(int convex, int triangle) = 0;
  virtual void SetTriangleMaterialIndex(int convex, int triangle, int index7bits) = 0;
};

struct convertconvexparams_t {
  bool buildOuterConvexHull;
  bool buildDragAxisAreas;
  bool buildOptimizedTraceTables;
  float dragAreaEpsilon;
  CPhysConvex *pForcedOuterHull;
};

// IPhysicsCollision as far as DestroyQueryModel, in vphysics_interface.h's order: only the slots count, so the
// calls not made here take nothing
class IPhysicsCollision {
public:
  virtual ~IPhysicsCollision() {}
  virtual CPhysConvex *ConvexFromVerts(void *, int) = 0;
  virtual CPhysConvex *ConvexFromPlanes(float *planes, int planeCount, float mergeDistance) = 0;
  virtual float ConvexVolume(CPhysConvex *) = 0;
  virtual float ConvexSurfaceArea(CPhysConvex *) = 0;
  virtual void SetConvexGameData(CPhysConvex *, unsigned int) = 0;
  virtual void ConvexFree(CPhysConvex *) = 0;
  virtual void BBoxToConvex() = 0;
  virtual void ConvexFromConvexPolyhedron() = 0;
  virtual void ConvexesFromConvexPolygon() = 0;
  virtual void PolysoupCreate() = 0;
  virtual void PolysoupDestroy() = 0;
  virtual void PolysoupAddTriangle() = 0;
  virtual void ConvertPolysoupToCollide() = 0;
  virtual CPhysCollide *ConvertConvexToCollide(CPhysConvex **, int) = 0;
  virtual CPhysCollide *ConvertConvexToCollideParams(CPhysConvex **, int, const convertconvexparams_t &) = 0;
  virtual void DestroyCollide(CPhysCollide *) = 0;
  virtual int CollideSize(CPhysCollide *) = 0;
  virtual int CollideWrite(char *dest, CPhysCollide *, bool swap) = 0;
  virtual void UnserializeCollide() = 0;
  virtual float CollideVolume(CPhysCollide *) = 0;
  virtual void CollideSurfaceArea() = 0;
  virtual void CollideGetExtent() = 0;
  virtual void CollideGetAABB() = 0;
  virtual void CollideGetMassCenter() = 0;
  virtual void CollideSetMassCenter() = 0;
  virtual void CollideGetOrthographicAreas() = 0;
  virtual void CollideSetOrthographicAreas() = 0;
  virtual void CollideIndex() = 0;
  virtual void BBoxToCollide() = 0;
  virtual void GetConvexesUsedInCollideable() = 0;
  virtual void TraceBox1() = 0;
  virtual void TraceBox2() = 0;
  virtual void TraceBox3() = 0;
  virtual void TraceCollide() = 0;
  virtual void IsBoxIntersectingCone() = 0;
  virtual void VCollideLoad() = 0;
  virtual void VCollideUnload() = 0;
  virtual void VPhysicsKeyParserCreate() = 0;
  virtual void VPhysicsKeyParserDestroy() = 0;
  virtual void CreateDebugMesh() = 0;
  virtual void DestroyDebugMesh() = 0;
#ifdef _WIN64
  // GMod's 64-bit vphysics.dll has one slot more before CreateQueryModel than the header (43, not 42): measured
  // 2026-10-26 by calling each slot near it on a box. Where in the list it is added is not known; nothing between
  // CollideVolume and CreateQueryModel is called here. stevenlafl's 32-bit vphysics_srv.so has the header's order
  virtual void Win64Unknown() = 0;
#endif
  virtual ICollisionQuery *CreateQueryModel(CPhysCollide *) = 0;
  virtual void DestroyQueryModel(ICollisionQuery *) = 0;
};

// a convex as given: its planes, their materials and its box
struct Brush {
  std::vector<float> planes;
  std::vector<int> materials;
  float mins[3], maxs[3];
};

// a point within a unit of the brush, on or inside every side
static bool holds(const Brush &b, const float *p) {
  for (size_t k = 0; k < b.materials.size(); k++) {
    const float *q = &b.planes[k * 4];
    if (q[0] * p[0] + q[1] * p[1] + q[2] * p[2] - q[3] > 1.0f) return false;
  }
  return true;
}

// the side whose normal is nearest the triangle's (vbsp's FindBrushSide), of those the triangle's middle lies on:
// by its facing alone, a wood box standing on a concrete floor gave the floor under its edge its top's wood
// (stalkyard, 5 of 21 crates, 2026-10-26)
static int sideOf(const Brush &b, const float *normal, const float *middle) {
  int best = -1;
  float most = -2;
  for (size_t k = 0; k < b.materials.size(); k++) {
    const float *q = &b.planes[k * 4];
    if (fabsf(q[0] * middle[0] + q[1] * middle[1] + q[2] * middle[2] - q[3]) > 1.0f) continue;
    float d = q[0] * normal[0] + q[1] * normal[1] + q[2] * normal[2];
    if (d > most) {
      most = d;
      best = (int)k;
    }
  }
  return most > 0.99f ? best : -1;
}

// Sets each triangle of `collide` to the material of the brush side under it. The query lists the convexes in
// the order given, as far as seen; a triangle whose convex by that order doesn't hold it is looked for in every
// brush whose box holds it. Says on stderr how many lie on no side.
static void setMaterials(IPhysicsCollision *physcollision, CPhysCollide *collide, const std::vector<Brush> &brushes) {
  const float CELL = 256;
  std::map<long long, std::vector<int> > grid;
  std::vector<int> huge;
  auto key = [](long long x, long long y, long long z) { return (x & 0xfffff) | ((y & 0xfffff) << 20) | ((z & 0xfffff) << 40); };
  for (size_t b = 0; b < brushes.size(); b++) {
    long long lo[3], hi[3], cells = 1;
    for (int k = 0; k < 3; k++) {
      lo[k] = (long long)floorf((brushes[b].mins[k] - 1) / CELL);
      hi[k] = (long long)floorf((brushes[b].maxs[k] + 1) / CELL);
      cells *= hi[k] - lo[k] + 1;
    }
    if (cells > 4096) {
      huge.push_back((int)b);
      continue;
    }
    for (long long x = lo[0]; x <= hi[0]; x++)
      for (long long y = lo[1]; y <= hi[1]; y++)
        for (long long z = lo[2]; z <= hi[2]; z++) grid[key(x, y, z)].push_back((int)b);
  }
  ICollisionQuery *query = physcollision->CreateQueryModel(collide);
  int missed = 0, triangles = 0;
  for (int i = 0; i < query->ConvexCount(); i++) {
    for (int j = 0; j < query->TriangleCount(i); j++) {
      triangles++;
      Vector v[3];
      query->GetTriangleVerts(i, j, v);
      // clockwise, so this faces out (vbsp's TriangleNormal)
      float e0[3] = {v[1].x - v[0].x, v[1].y - v[0].y, v[1].z - v[0].z};
      float e1[3] = {v[2].x - v[0].x, v[2].y - v[0].y, v[2].z - v[0].z};
      float n[3] = {e1[1] * e0[2] - e1[2] * e0[1], e1[2] * e0[0] - e1[0] * e0[2], e1[0] * e0[1] - e1[1] * e0[0]};
      float len = sqrtf(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
      if (len <= 0) continue;
      for (int k = 0; k < 3; k++) n[k] /= len;
      float c[3] = {(v[0].x + v[1].x + v[2].x) / 3, (v[0].y + v[1].y + v[2].y) / 3, (v[0].z + v[1].z + v[2].z) / 3};
      int brush = -1, side = -1;
      if (i < (int)brushes.size() && holds(brushes[i], c)) {
        brush = i;
        side = sideOf(brushes[i], n, c);
      }
      if (side < 0) {
        std::vector<int> found = huge;
        auto at = grid.find(key((long long)floorf(c[0] / CELL), (long long)floorf(c[1] / CELL), (long long)floorf(c[2] / CELL)));
        if (at != grid.end()) found.insert(found.end(), at->second.begin(), at->second.end());
        for (int b : found) {
          if (!holds(brushes[b], c)) continue;
          int s = sideOf(brushes[b], n, c);
          if (s < 0) continue;
          brush = b;
          side = s;
          break;
        }
      }
      if (side < 0) {
        missed++;
        continue;
      }
      int material = brushes[brush].materials[side];
      if (material > 0) query->SetTriangleMaterialIndex(i, j, material);
    }
  }
  physcollision->DestroyQueryModel(query);
  fprintf(stderr, "vcollide: %d of %d triangles on no brush side\n", missed, triangles);
}

static int readInt(FILE *f) {
  int v = 0;
  if (fread(&v, 4, 1, f) != 1) {
    fprintf(stderr, "vcollide: input cut short\n");
    exit(1);
  }
  return v;
}

static CreateInterfaceFn factoryOf(const char *path) {
#ifdef _WIN32
  // the DLL's own folder first, for the tier0 and vstdlib beside it
  HMODULE lib = LoadLibraryExA(path, NULL, LOAD_WITH_ALTERED_SEARCH_PATH);
  if (!lib) {
    fprintf(stderr, "vcollide: can't load %s (error %lu)\n", path, GetLastError());
    return NULL;
  }
  return (CreateInterfaceFn)GetProcAddress(lib, "CreateInterface");
#else
  void *lib = dlopen(path, RTLD_NOW);
  if (!lib) {
    fprintf(stderr, "vcollide: %s\n", dlerror());
    return NULL;
  }
  return (CreateInterfaceFn)dlsym(lib, "CreateInterface");
#endif
}

int main(int argc, char **argv) {
  if (argc != 4) {
    fprintf(stderr, "usage: vcollide <vphysics library> <in> <out>\n");
    return 2;
  }
  CreateInterfaceFn factory = factoryOf(argv[1]);
  IPhysicsCollision *physcollision = factory ? (IPhysicsCollision *)factory("VPhysicsCollision007", NULL) : NULL;
  if (!physcollision) {
    fprintf(stderr, "vcollide: no VPhysicsCollision007 in %s\n", argv[1]);
    return 1;
  }
  FILE *in = fopen(argv[2], "rb");
  FILE *out = fopen(argv[3], "wb");
  if (!in || !out) {
    fprintf(stderr, "vcollide: can't open the files\n");
    return 1;
  }
  int solids = readInt(in);
  for (int s = 0; s < solids; s++) {
    int kind = readInt(in);
    int count = readInt(in);
    std::vector<CPhysConvex *> convexes;
    std::vector<Brush> brushes;
    bool anyMaterial = false;
    float volume = 0;
    for (int c = 0; c < count; c++) {
      int planes = readInt(in);
      Brush brush;
      if (fread(brush.mins, 4, 3, in) != 3 || fread(brush.maxs, 4, 3, in) != 3) {
        fprintf(stderr, "vcollide: input cut short\n");
        return 1;
      }
      for (int k = 0; k < planes; k++) {
        float plane[4];
        if (fread(plane, 4, 4, in) != 4) {
          fprintf(stderr, "vcollide: input cut short\n");
          return 1;
        }
        brush.planes.insert(brush.planes.end(), plane, plane + 4);
        brush.materials.push_back(readInt(in));
        anyMaterial = anyMaterial || brush.materials.back() > 0;
      }
      // vbsp's VPHYSICS_MERGE: corners closer than this are one
      CPhysConvex *convex = physcollision->ConvexFromPlanes(brush.planes.data(), planes, 0.01f);
      if (!convex) continue;
      brushes.push_back(brush);
      // vbsp (ivp.cpp) puts the brush number here and reads it back itself, to find the side each triangle lies
      // on; setMaterials finds it by where the triangle is instead, so 0. The game does not read it: crates hit
      // the world as `default` whatever is here (stevenlafl measured it). The convex's own number past 126
      // crashed Windows' 64-bit vphysics.dll
      physcollision->SetConvexGameData(convex, 0);
      volume += physcollision->ConvexVolume(convex);
      convexes.push_back(convex);
    }
    CPhysCollide *collide = NULL;
    if (!convexes.empty()) {
      if (kind == 0) {
        collide = physcollision->ConvertConvexToCollide(convexes.data(), (int)convexes.size());
        if (collide && anyMaterial) setMaterials(physcollision, collide, brushes);
      } else {
        // no drag areas and no outer hull, which vbsp builds: outside the game GMod's 64-bit vphysics.dll never
        // comes back from the drag areas (one box) and crashes on an outer hull of several convexes (stalkyard's
        // brush entities), measured 2026-10-25. The drag areas only set a moving brush entity's air drag; without
        // the hull it collides as its pieces, as exactly
        convertconvexparams_t params = {false, false, false, 1.0f, NULL};
        collide = physcollision->ConvertConvexToCollideParams(convexes.data(), (int)convexes.size(), params);
      }
    }
    int size = collide ? physcollision->CollideSize(collide) : 0;
    std::vector<char> bytes(size);
    if (collide) physcollision->CollideWrite(bytes.data(), collide, false);
    fwrite(&size, 4, 1, out);
    if (size) fwrite(bytes.data(), 1, size, out);
    fwrite(&volume, 4, 1, out);
    if (collide) physcollision->DestroyCollide(collide);
  }
  fclose(out);
  return 0;
}

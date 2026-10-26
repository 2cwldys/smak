// A map's physics collision (the PHYSCOLLIDE lump's solids) made by GMod's own vphysics, as vbsp makes it (Source
// SDK 2013 src/utils/vbsp/ivp.cpp): each solid is a list of convex brushes given as planes, made into one collide
// by IPhysicsCollision and written out in vphysics' own binary format, which nothing documents. Ported from
// stevenlafl's tools/map/vcollide.cpp (Linux, 32-bit vphysics_srv.so); here also Windows' 64-bit vphysics.dll.
// Built and run by src/source/vcollide.mjs. Build it for the DLL's machine (x64 for bin/win64), with the
// compiler Valve's was built with (MSVC on Windows), so the interface's slots are where the DLL has them.
//
//   vcollide <vphysics library> <in> <out>
// in:  int solids; each: int kind (0 the world's static solid, 1 a brush entity's), int convexes; each
//      convex: int planes, int surface (its surfaceprop's index in the game's table, as vbsp gives it), then
//      planes x { float nx, ny, nz, dist } facing out of it
// out: for each solid: int bytes, the collide, float volume (cubic inches)
#include <stdio.h>
#include <stdlib.h>
#include <vector>
#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

typedef void *(*CreateInterfaceFn)(const char *name, int *ret);
struct CPhysConvex;
struct CPhysCollide;

struct convertconvexparams_t {
  bool buildOuterConvexHull;
  bool buildDragAxisAreas;
  bool buildOptimizedTraceTables;
  float dragAreaEpsilon;
  CPhysConvex *pForcedOuterHull;
};

// IPhysicsCollision as far as CollideVolume, in vphysics_interface.h's order: only the slots count, so the
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
};

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
    float volume = 0;
    for (int c = 0; c < count; c++) {
      int planes = readInt(in);
      int surface = readInt(in);
      std::vector<float> data(planes * 4);
      if (fread(data.data(), 4, data.size(), in) != data.size()) {
        fprintf(stderr, "vcollide: input cut short\n");
        return 1;
      }
      // vbsp's VPHYSICS_MERGE: corners closer than this are one
      CPhysConvex *convex = physcollision->ConvexFromPlanes(data.data(), planes, 0.01f);
      if (!convex) continue;
      // the game reads a convex's game data as its surfaceprop (vbsp's ivp.cpp): the convex's own number there
      // (stevenlafl's) made the world's pieces antlion (87 in GMod's table), flesh and the rest, or past the table
      physcollision->SetConvexGameData(convex, surface);
      volume += physcollision->ConvexVolume(convex);
      convexes.push_back(convex);
    }
    CPhysCollide *collide = NULL;
    if (!convexes.empty()) {
      if (kind == 0) collide = physcollision->ConvertConvexToCollide(convexes.data(), (int)convexes.size());
      else {
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

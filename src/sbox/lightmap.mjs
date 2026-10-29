// A GoldSrc map drawn in s&box with the light its compiler baked: every face's lightmap packed into one picture of
// the map's (an atlas), and a shader of SMAK's own that lays it on the texture as GoldSrc does. The map's light is
// then the game's own, room by room, bounces and all, with no light of s&box's to bake (the GMod port keeps
// GoldSrc's lightmaps the same way, converted).
//
//   lightmapAtlas(bsp, faces, patterns) -> { width, height, rgba, offsetOf(face), styles }: the faces' light in one
//                                          picture, and the patterns of the styles that change
//   LIGHTMAP_SHADER, lightmapShader()   the shader's path in a project, and its text
//
// WHERE A FACE'S LIGHT IS. A PolygonMesh has one set of texture coordinates, the texture's. The face's place in the
// atlas rides in its corners' vertex colour instead, the same at every corner: two numbers of 16 bits (red and
// green, blue and alpha), the atlas pixel of its first sample less the sample's place on the texture's grid (its
// texture pixel / 16), plus OFFSET_BIAS. The shader finds a point's sample from its texture pixel (its texture
// coordinates times the texture's size, g_vTextureSize) / 16 plus that, half a pixel on to the sample's middle, and
// reads the atlas between samples (bilinear), as GoldSrc mixes them. Each face's samples have a border of their own
// edge's copied round them, so no face's light runs into another's.
//
// THE LIGHT AS GOLDSRC LAYS IT (draw.mjs BRIGHTNESS): the screen's colour is the texture's times sample / 255
// times 1.55, cut off at white, both as the screen shows them. s&box adds up light in linear light: the same
// colour is worked out on the screen's colours (the sRGB curve undone and done again round it). Drawn as emission, on no
// albedo: s&box's own lights add only their gloss.
//
// ITS STYLES. A face has up to four lightmaps, one a style (light.mjs), each style a pattern of letters the game
// plays at ten a second ("m" the light as baked: stylePatterns). A style whose pattern is one letter is steady: its
// light is added into the atlas at its letter's share ("a" none, "m" all). A style whose pattern changes (a flicker,
// a strobe) is kept apart, in a layer of the atlas below the first, at the same place as its face's patch, one layer
// for each such style a face has; the layer's alpha is the style's row in a second picture, `styles` (one row a
// style: its letters in red, (letter - "a") x 10, its length in green), which the shader plays by its clock
// (g_flTime), as the game plays them. A light switched by a name stays as the map starts it: no stock TS map
// switches one, and a switch needs code of the game's.
import { faceLightmap, LUXEL } from "../maps/bsp.mjs";
import { stylePatterns } from "../maps/light.mjs";

/** The shader's path in a project's Assets. */
export const LIGHTMAP_SHADER = "shaders/smak_lightmapped.shader";
/** What a light sample (a share of 255) is multiplied by before it meets the texture (draw.mjs BRIGHTNESS). */
export const LIGHTMAP_SCALE = 1.55;
/** Added to a face's offset so that it is never below 0 in its 16 bits. */
export const OFFSET_BIAS = 32768;
/** The atlas's width, in samples; its height what the faces need, a power of two. */
const ATLAS_WIDTH = 1024;
/** texinfo_t.flags: a face the game draws with no lightmap, at full light (TEX_SPECIAL: a liquid's, the sky's). */
const TEX_SPECIAL = 1;
/** The longest pattern the game plays (MAX_LIGHTSTYLE), the styles picture's width. */
const PATTERN_LONGEST = 64;
/** A style's letter in the styles picture: (letter - "a") x this; "m" (12) is the light as baked. */
const LETTER_STEP = 10;
const AS_BAKED = 12;
const letterOf = (pattern, nth) => pattern.charCodeAt(nth) - 97;

/** The shader's text: s&box's standard material inputs (TextureColor, TextureTranslucency, F_ALPHA_TEST), the
 * map's atlas (TextureLightmap) and its size, the texture's size in pixels, and the face's offset in its vertex
 * colour (PolygonMesh's, the vertex paint's tint). */
export const lightmapShader =
  () => `// Made by SMAK (src/sbox/lightmap.mjs): a GoldSrc surface lit by its own lightmap.
HEADER
{
	Description = "SMAK: GoldSrc lightmapped surface";
	DevShader = false;
	Version = 1;
}

FEATURES
{
	#include "common/features.hlsl"
	Feature( F_ALPHA_TEST, 0..1, "Rendering" );
	Feature( F_FULL_LIGHT, 0..1, "Rendering" );
}

MODES
{
	Forward();
	Depth( S_MODE_DEPTH );
	ToolsShadingComplexity( "tools_shading_complexity.shader" );
}

COMMON
{
	#include "common/shared.hlsl"
}

struct VertexInput
{
	float4 vPlace : TEXCOORD5 < Semantic( VertexPaintTintColor ); >;
	#include "common/vertexinput.hlsl"
};

struct PixelInput
{
	float4 vPlace : TEXCOORD15;
	#include "common/pixelinput.hlsl"
};

VS
{
	#include "common/vertex.hlsl"

	PixelInput MainVs( VertexInput i )
	{
		PixelInput o = ProcessVertex( i );
		o.vPlace = i.vPlace;
		return FinalizeVertex( o );
	}
}

PS
{
	#include "common/pixel.hlsl"

	StaticCombo( S_ALPHA_TEST, F_ALPHA_TEST, Sys( ALL ) );
	StaticCombo( S_FULL_LIGHT, F_FULL_LIGHT, Sys( ALL ) );

	// the texture and its holes, mixed by Box as complex.shader's are (AlphaWeighted fails on sides not a power of two)
	CreateInputTexture2D( TextureColor, Srgb, 8, "", "_color", "Material,10/10", Default3( 1.0, 1.0, 1.0 ) );
	CreateInputTexture2D( TextureTranslucency, Linear, 8, "", "_trans", "Material,10/20", Default( 1.0 ) );
	Texture2D g_tColor < Channel( RGB, Box( TextureColor ), Srgb ); Channel( A, Box( TextureTranslucency ), Linear ); OutputFormat( BC7 ); SrgbRead( true ); >;
	SamplerState TextureFiltering < Filter( ANISOTROPIC ); MaxAniso( 8 ); >;
	TextureAttribute( RepresentativeTexture, g_tColor );
	#define MATERIAL_ALPHA_TEXTURE g_tColor

	CreateInputTexture2D( TextureLightmap, Linear, 8, "", "_light", "Light,20/10", Default3( 1.0, 1.0, 1.0 ) );
	Texture2D g_tLightmap < Channel( RGBA, Box( TextureLightmap ), Linear ); OutputFormat( RGBA8888 ); SrgbRead( false ); >;
	SamplerState LightmapFiltering < Filter( BILINEAR ); AddressU( CLAMP ); AddressV( CLAMP ); >;
	float2 g_vLightmapSize < Default2( 1024.0, 1024.0 ); UiGroup( "Light,20/20" ); >;
	float2 g_vTextureSize < Default2( 64.0, 64.0 ); UiGroup( "Light,20/30" ); >;
	float g_flLightScale < Default( ${LIGHTMAP_SCALE} ); Range( 0.0, 4.0 ); UiGroup( "Light,20/40" ); >;
	// the styles that change: how many layers below the first, how far down the first is, how far apart they are,
	// and the styles' patterns
	float g_flStyleLayers < Default( 0.0 ); Range( 0.0, 3.0 ); UiGroup( "Light,20/50" ); >;
	float g_flFirstLayer < Default( 1024.0 ); UiGroup( "Light,20/55" ); >;
	float g_flLayerHeight < Default( 1024.0 ); UiGroup( "Light,20/60" ); >;
	CreateInputTexture2D( TextureStyles, Linear, 8, "", "_styles", "Light,20/70", Default3( 0.0, 0.0, 0.0 ) );
	Texture2D g_tStyles < Channel( RGBA, Box( TextureStyles ), Linear ); OutputFormat( RGBA8888 ); SrgbRead( false ); >;

	// the sRGB curve each way: the screen's colour of a linear one, and back
	float3 Shown( float3 c ) { c = max( c, 0.0 ); return lerp( 1.055 * pow( c, 1.0 / 2.4 ) - 0.055, c * 12.92, step( c, 0.0031308 ) ); }
	float3 Linear( float3 s ) { s = max( s, 0.0 ); return lerp( pow( ( s + 0.055 ) / 1.055, 2.4 ), s / 12.92, step( s, 0.04045 ) ); }

	float4 MainPs( PixelInput i ) : SV_Target0
	{
		Material m = Material::Init( i );
		float4 color = g_tColor.Sample( TextureFiltering, i.vTextureCoords.xy );
		m.Opacity = color.a;
		// the decals laid on it (a bullet's hole: s&box's Decal), on the texture before its light, as GoldSrc lights a
		// decal by its face's lightmap; as ShadingModelStandard::Shade lays them, on the material
		m.Albedo = color.rgb;
		Decals::Apply( m.WorldPosition, m );
		#if S_FULL_LIGHT
			// no lightmap: full light (its scale 1.55: a liquid's), or dark (0: a face left unlit)
			float3 light = saturate( g_flLightScale );
		#else
			float4 bytes = round( i.vPlace * 255.0 );
			float2 offset = float2( bytes.r + bytes.g * 256.0, bytes.b + bytes.a * 256.0 ) - ${OFFSET_BIAS}.0;
			float2 at = i.vTextureCoords.xy * g_vTextureSize / ${LUXEL}.0 + offset + 0.5;
			float3 light = g_tLightmap.SampleLevel( LightmapFiltering, at / g_vLightmapSize, 0 ).rgb;
		// the styles that change, each at its letter of the moment (ten a second)
		for ( int layer = 1; layer <= (int)g_flStyleLayers; layer++ )
		{
			float4 styled = g_tLightmap.SampleLevel( LightmapFiltering, ( at + float2( 0.0, g_flFirstLayer + ( layer - 1 ) * g_flLayerHeight ) ) / g_vLightmapSize, 0 );
			int row = (int)round( styled.a * 255.0 );
			float letters = max( round( g_tStyles.Load( int3( 0, row, 0 ) ).g * 255.0 ), 1.0 );
			int letter = (int)fmod( floor( g_flTime * 10.0 ), letters );
			light += styled.rgb * ( g_tStyles.Load( int3( letter, row, 0 ) ).r * 255.0 / ${LETTER_STEP * AS_BAKED}.0 );
		}
		light *= g_flLightScale;
		#endif
		// GoldSrc's texture x light, cut off at white, on the colours as the screen shows them; s&box's light is linear
		m.Emission = Linear( min( Shown( m.Albedo ) * light, 1.0 ) );
		m.Albedo = 0.0;
		m.Metalness = 0.0;
		m.Roughness = 1.0;
		// ShadingModelStandard::Shade's ending, without its lights: s&box's lamps put no shine on GoldSrc's world
		AdjustAlphaToCoverage( m );
		if ( DepthNormals::WantsDepthNormals() )
			return DepthNormals::Output( m.Normal, m.Roughness, m.Opacity );
		if ( g_bWireframeMode )
			return g_vWireframeColor;
		float4 shown = float4( m.Emission, m.Opacity );
		if ( g_bFogEnabled )
			shown.rgb = Fog::Apply( m.WorldPosition, m.ScreenPosition.xy, shown.rgb );
		return shown;
	}
}
`;

const special = (bsp, face) => Boolean(bsp.texinfo[(typeof face === "number" ? bsp.faces[face] : face).texinfo]?.flags & TEX_SPECIAL); // prettier-ignore

/**
 * The light of `faces` (face numbers) in one picture: `{ width, height, firstLayer, layerHeight, layers, rgba,
 * offsetOf(face), fullOf(face), styles }`. Each face's steady styles (`patterns`: stylePatterns) added up at their
 * letter's share and cut off at 255, in a patch of its own with a border of its edge's samples round it; the styles
 * that change in the `layers` layers below (the module's head), the first `firstLayer` down from its patch, each
 * `layerHeight` down from the last (the faces whose styles change are packed first). `offsetOf(face)`: its
 * corners' vertex colour, [r, g, b, a] (the module's head); null for a face with no light: `fullOf(face)` says
 * whether the game draws it at full light (a liquid's, the sky's) or dark. `styles`: null, or the styles that change
 * as a picture, `{ width, height, rgba, rows }` (`rows` their numbers, in their rows' order).
 */
export function lightmapAtlas(bsp, faces, patterns = stylePatterns(bsp)) {
  const patternOf = (style) => (patterns.get(style) || "m").slice(0, PATTERN_LONGEST);
  const steady = (pattern) => [...pattern].every((letter) => letter === pattern[0]);
  const patches = [];
  const changing = new Set();
  for (const face of new Set(faces)) {
    const lightmap = faceLightmap(bsp, face);
    if (!lightmap) continue;
    const kept = [];
    const moving = [];
    for (const style of lightmap.styles) {
      const pattern = patternOf(style.style);
      if (!steady(pattern)) moving.push(style);
      else if (letterOf(pattern, 0) > 0) kept.push({ style, share: letterOf(pattern, 0) / AS_BAKED });
    }
    if (!kept.length && !moving.length) continue;
    for (const { style } of moving) changing.add(style);
    patches.push({ face, lightmap, kept, moving, w: lightmap.width + 2, h: lightmap.height + 2 });
  }
  // shelves, the faces whose styles change first (the layers below need be only as tall as their shelves), the
  // tallest first
  patches.sort((a, b) => Math.sign(b.moving.length) - Math.sign(a.moving.length) || b.h - a.h || b.w - a.w);
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const p of patches) {
    if (x + p.w > ATLAS_WIDTH) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    Object.assign(p, { x, y });
    x += p.w;
    shelf = Math.max(shelf, p.h);
  }
  const width = ATLAS_WIDTH;
  const firstLayer = y + shelf;
  const layers = Math.max(0, ...patches.map((p) => p.moving.length));
  const layerHeight = Math.max(0, ...patches.filter((p) => p.moving.length).map((p) => p.y + p.h));
  let height = 1;
  while (height < firstLayer + layers * layerHeight) height *= 2;
  const rows = [...changing].sort((a, b) => a - b);
  const rgba = new Uint8Array(width * height * 4);
  const places = new Map();
  for (const { face, lightmap, kept, moving, x: px, y: py, w, h } of patches) {
    const { width: lw, height: lh } = lightmap;
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        // the border takes its nearest sample's light
        const sx = Math.min(lw - 1, Math.max(0, i - 1));
        const sy = Math.min(lh - 1, Math.max(0, j - 1));
        const sample = (sy * lw + sx) * 3;
        const at = ((py + j) * width + px + i) * 4;
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (const { style, share } of kept) sum += style.rgb[sample + c] * share;
          rgba[at + c] = Math.min(255, Math.round(sum));
        }
        rgba[at + 3] = 255;
        moving.forEach(({ style, rgb }, k) => {
          const below = at + (firstLayer + k * layerHeight) * width * 4;
          for (let c = 0; c < 3; c++) rgba[below + c] = rgb[sample + c];
          rgba[below + 3] = rows.indexOf(style);
        });
      }
    // the first sample's atlas pixel less its place on the texture's grid
    const ox = px + 1 - lightmap.originS / LUXEL + OFFSET_BIAS;
    const oy = py + 1 - lightmap.originT / LUXEL + OFFSET_BIAS;
    places.set(face, [ox & 255, ox >> 8, oy & 255, oy >> 8]);
  }
  return {
    width,
    height,
    firstLayer,
    layerHeight,
    layers,
    rgba,
    offsetOf: (face) => places.get(face) ?? null,
    fullOf: (face) => special(bsp, face),
    styles: rows.length ? stylesPicture(rows, patternOf) : null,
  };
}

/** The patterns of `rows` (styles) as a picture, one row a style: its letters in red, its length in green. */
function stylesPicture(rows, patternOf) {
  const width = PATTERN_LONGEST;
  let height = 1;
  while (height < rows.length) height *= 2;
  const rgba = new Uint8Array(width * height * 4);
  rows.forEach((style, row) => {
    const pattern = patternOf(style);
    for (let i = 0; i < width; i++) {
      const at = (row * width + i) * 4;
      rgba[at] = Math.max(0, Math.min(25, letterOf(pattern, i % pattern.length))) * LETTER_STEP;
      rgba[at + 1] = pattern.length;
      rgba[at + 3] = 255;
    }
  });
  return { width, height, rgba, rows };
}

// A GoldSrc model lit as GoldSrc lights one (maps/model-light.mjs): one light a model, which the game works out
// where the model stands and hands its renderer each frame as render attributes, and every point shaded by its
// normal against that light's way (R_StudioLighting). s&box's own lights and shine reach none of it.
//
// THE ATTRIBUTES (Renderer.Attributes, set by the game):
//   SmakModelLight     float3  the light, 0 to 255 a channel: the sky's, or the floor's under the model (lightAt)
//   SmakModelLightWay  float3  the way it shines, in the world (down is 0 0 -1)
//   SmakModelLit       float   1 once the game has set them; until then the model is drawn as GoldSrc draws one
//                              out of any world (r_fullbright, a menu's model): ambient 192, no shade
//   SmakModelLightTotal, SmakModelLightReach  float  set when dynamic lights reach the model (R_EntityDynamicLight:
//                              each within its radius adds radius - distance to the total, pulls the way toward
//                              itself by as much, and tints the light by its colour x that / 256): the total, and how
//                              long the way is once pulled, of which v_direct shades; 0 for none (the brightest
//                              channel both)
//   SmakModelBlend     float   an entity's render amount over 255 (tr.blend) for a material copied with F_TRANSLUCENT
//                              set: 1 blends by it (kRenderTransColor, TransTexture, Glow, TransAlpha: SRC_ALPHA,
//                              ONE_MINUS_SRC_ALPHA, still writing depth), 2 adds the texture times it, unlit, writing no
//                              depth and unfogged (kRenderTransAdd: ONE, ONE; Xash gl_studio.c GL_StudioSetRenderMode,
//                              R_StudioSetupRenderer, the light values set to tr.blend); added in linear light here, not
//                              on the screen's colours as GoldSrc adds
//
// THE COLOUR, as the engine makes it (engine/client/gamma.c, gl_studio.c): the texture through texgamma (each colour
// to the power texgamma / gamma, 2.0 / 2.5: dark colours lifted most) times the vertex colour, the light's colour
// times lightgamma(illum) / 255, which at gamma and lightgamma 2.5 and brightness 0 is illum / 255. Worked on the
// colours as the screen shows them; s&box's light is linear. A fullbright texture is texgamma's texture as it is.
// Measured against TS on Steam (2026-10-28, ts_lobby's hallway from a demo's own camera): a scale fitted from the
// map's light instead (1.55, its mid tones) drew a near-black coat two thirds as bright as TS does.
import { SHADE_LAMBERT, DIRECT } from "../maps/model-light.mjs";

/** The shader's path in a project's Assets. */
export const STUDIO_SHADER = "shaders/smak_studio.shader";
/** What a model's light is multiplied by. The engine's code (Xash3D's) says 1 (lightgamma's table a straight line at
 * brightness 0); TS on Steam draws a model 1.5 times that (2026-10-28, ts_lobby's hallway, agent's suit from a demo's
 * own camera: 1.51, 1.49, 1.49 by channel, the floor beside him as TS draws it). One measurement: a constant, or
 * Steam's engine shading a model otherwise, is not told apart yet. */
export const STUDIO_SCALE = 1.5;
/** The power a texture's colours are raised to: texgamma over gamma (2.0 / 2.5), the engine's defaults. */
export const STUDIO_TEXGAMMA = 2.0 / 2.5;
/** The ambient light of a model the game has not lit (R_EntityDynamicLight out of a world). */
const UNLIT_AMBIENT = 192;

/** The shader's text: a texture (TextureColor) and its holes (TextureTranslucency, F_ALPHA_TEST), F_FULLBRIGHT and
 * F_FLATSHADE as GoldSrc's texture flags, the light in the render attributes above, and F_TRANSLUCENT an entity's
 * render mode (1 blended, 2 added: the game sets it on a copy of the material). */
export const studioShader =
  () => `// Made by SMAK (src/sbox/studio.mjs): a GoldSrc model lit as GoldSrc lights one.
HEADER
{
	Description = "SMAK: GoldSrc model, lit as GoldSrc lights one";
	DevShader = false;
	Version = 1;
}

FEATURES
{
	#include "common/features.hlsl"
	Feature( F_ALPHA_TEST, 0..1, "Rendering" );
	Feature( F_FULLBRIGHT, 0..1, "Rendering" );
	Feature( F_FLATSHADE, 0..1, "Rendering" );
	Feature( F_TRANSLUCENT, 0..2, "Rendering" );
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
	#include "common/vertexinput.hlsl"
};

struct PixelInput
{
	#include "common/pixelinput.hlsl"
};

VS
{
	#include "common/vertex.hlsl"

	PixelInput MainVs( VertexInput i )
	{
		PixelInput o = ProcessVertex( i );
		return FinalizeVertex( o );
	}
}

PS
{
	#include "common/pixel.hlsl"

	StaticCombo( S_ALPHA_TEST, F_ALPHA_TEST, Sys( ALL ) );
	StaticCombo( S_FULLBRIGHT, F_FULLBRIGHT, Sys( ALL ) );
	StaticCombo( S_FLATSHADE, F_FLATSHADE, Sys( ALL ) );
	StaticCombo( S_TRANSLUCENT, F_TRANSLUCENT, Sys( ALL ) );

	#if S_TRANSLUCENT == 1
		RenderState( BlendEnable, true );
		RenderState( SrcBlend, SRC_ALPHA );
		RenderState( DstBlend, INV_SRC_ALPHA );
	#elif S_TRANSLUCENT == 2
		RenderState( BlendEnable, true );
		RenderState( SrcBlend, ONE );
		RenderState( DstBlend, ONE );
		RenderState( DepthWriteEnable, false );
	#endif

	CreateInputTexture2D( TextureColor, Srgb, 8, "", "_color", "Material,10/10", Default3( 1.0, 1.0, 1.0 ) );
	CreateInputTexture2D( TextureTranslucency, Linear, 8, "", "_trans", "Material,10/20", Default( 1.0 ) );
	Texture2D g_tColor < Channel( RGB, Box( TextureColor ), Srgb ); Channel( A, Box( TextureTranslucency ), Linear ); OutputFormat( BC7 ); SrgbRead( true ); >;
	SamplerState TextureFiltering < Filter( ANISOTROPIC ); MaxAniso( 8 ); >;
	TextureAttribute( RepresentativeTexture, g_tColor );
	#define MATERIAL_ALPHA_TEXTURE g_tColor

	float g_flLightScale < Default( ${STUDIO_SCALE.toFixed(3)} ); Range( 0.0, 4.0 ); UiGroup( "Light,20/10" ); >;
	float g_flTexGamma < Default( ${STUDIO_TEXGAMMA.toFixed(3)} ); Range( 0.2, 2.0 ); UiGroup( "Light,20/15" ); >;
	float g_flDirect < Default( ${DIRECT.toFixed(3)} ); Range( 0.0, 1.0 ); UiGroup( "Light,20/20" ); >;
	float3 g_vModelLight < Attribute( "SmakModelLight" ); Default3( 0.0, 0.0, 0.0 ); >;
	float3 g_vModelLightWay < Attribute( "SmakModelLightWay" ); Default3( 0.0, 0.0, -1.0 ); >;
	float g_flModelLit < Attribute( "SmakModelLit" ); Default( 0.0 ); >;
	float g_flModelLightTotal < Attribute( "SmakModelLightTotal" ); Default( 0.0 ); >;
	float g_flModelLightReach < Attribute( "SmakModelLightReach" ); Default( 0.0 ); >;
	float g_flModelBlend < Attribute( "SmakModelBlend" ); Default( 1.0 ); >;

	// the sRGB curve each way: the screen's colour of a linear one, and back
	float3 Shown( float3 c ) { c = max( c, 0.0 ); return lerp( 1.055 * pow( c, 1.0 / 2.4 ) - 0.055, c * 12.92, step( c, 0.0031308 ) ); }
	float3 Linear( float3 s ) { s = max( s, 0.0 ); return lerp( pow( ( s + 0.055 ) / 1.055, 2.4 ), s / 12.92, step( s, 0.04045 ) ); }

	float4 MainPs( PixelInput i ) : SV_Target0
	{
		Material m = Material::Init( i );
		float4 color = g_tColor.Sample( TextureFiltering, i.vTextureCoords.xy );
		m.Opacity = color.a;
		#if S_TRANSLUCENT == 2
			// kRenderTransAdd: the light values tr.blend, whatever the light
			float3 light = g_flModelBlend;
		#elif S_FULLBRIGHT
			float3 light = 1.0;
		#else
			// R_EntityDynamicLight's end: of the brightest channel v_direct shades, the rest ambient (128 at most)
			float total = max( max( g_vModelLight.r, g_vModelLight.g ), g_vModelLight.b );
			float3 tint = total > 0.0 ? g_vModelLight / total : 1.0;
			total = max( total, 1.0 );
			// the dynamic lights' share, when any reach the model: the total they raise, the way's length they make
			float reach = total;
			if ( g_flModelLightTotal > 0.0 ) { total = g_flModelLightTotal; reach = g_flModelLightReach; }
			float shade = reach * g_flDirect;
			float ambient = min( total - shade, 128.0 );
			if ( ambient + shade > 255.0 ) shade = 255.0 - ambient;
			if ( g_flModelLit < 0.5 ) { ambient = ${UNLIT_AMBIENT}.0; shade = 0.0; tint = 1.0; }
			// R_StudioLighting: the modified hemisphere, SHADE_LAMBERT over 1
			float illum = ambient + shade;
			#if S_FLATSHADE
				illum = ambient + shade * 0.8;
			#else
				float lightcos = min( dot( normalize( i.vNormalWs ), g_vModelLightWay ), 1.0 );
				lightcos = ( lightcos + ${(SHADE_LAMBERT - 1).toFixed(3)} ) / ${SHADE_LAMBERT.toFixed(3)};
				if ( lightcos > 0.0 ) illum -= shade * lightcos;
			#endif
			illum = clamp( illum, 0.0, 255.0 );
			float3 light = tint * ( illum / 255.0 ) * g_flLightScale;
		#endif
		// texgamma's texture x light, cut off at white, on the colours as the screen shows them; s&box's light is linear
		m.Emission = Linear( min( pow( Shown( color.rgb ), g_flTexGamma ) * light, 1.0 ) );
		#if S_TRANSLUCENT == 1
			m.Opacity *= g_flModelBlend;
		#endif
		m.Albedo = 0.0;
		m.Metalness = 0.0;
		m.Roughness = 1.0;
		// ShadingModelStandard::Shade's ending, without its lights
		AdjustAlphaToCoverage( m );
		if ( DepthNormals::WantsDepthNormals() )
			return DepthNormals::Output( m.Normal, m.Roughness, m.Opacity );
		if ( g_bWireframeMode )
			return g_vWireframeColor;
		float4 shown = float4( m.Emission, m.Opacity );
		#if S_TRANSLUCENT == 2
			return float4( shown.rgb, 1.0 );
		#endif
		if ( g_bFogEnabled )
			shown.rgb = Fog::Apply( m.WorldPosition, m.ScreenPosition.xy, shown.rgb );
		return shown;
	}
}
`;

/** A texture's material on the shader above: `color` its picture, `mask` a masked one's holes, `flags` GoldSrc's
 * (4 fullbright, 1 flat shade, 64 masked). */
export function studioVmatOf({ color, mask, flags = 0 }) {
  const lines = ["// Made by SMAK (sbox-port) from a GoldSrc texture, lit as GoldSrc lights a model.", "", "Layer0", "{", `\tshader "${STUDIO_SHADER}"`]; // prettier-ignore
  if (flags & 64 && mask) lines.push("\tF_ALPHA_TEST 1");
  if (flags & 4) lines.push("\tF_FULLBRIGHT 1");
  if (flags & 1) lines.push("\tF_FLATSHADE 1");
  lines.push(`\tTextureColor "${color}"`);
  if (flags & 64 && mask) lines.push(`\tTextureTranslucency "${mask}"`, '\tg_flAlphaTestReference "0.500"');
  lines.push("}", "");
  return lines.join("\n");
}

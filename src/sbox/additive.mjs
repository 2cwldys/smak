// GoldSrc's additive drawing in s&box: a sprite or a texture added to what is behind it as GoldSrc adds it, on the
// screen's colours, not on linear light as s&box's own additive blend does.
//
//   ADDITIVE_SHADER, additiveShader()   the shader's path in a project, and its text
//
// WHY. GoldSrc draws kRenderTransAdd by adding the texture's colour (times its render colour) to the frame as the
// screen shows it, cut off at white. s&box keeps the frame in linear light and adds there: a faint sprite (TS's gun
// smoke and laser beam, at most 27 of 255) adds the same on black, but on a grey wall (the screen's 0.5) about a tenth
// of what GoldSrc adds, and the sprite is lost.
//
// HOW. The shader reads the frame behind it (a copy, which the drawing code grabs: Graphics.GrabFrameTexture into
// FrameBufferCopyTexture), works out GoldSrc's sum on the screen's colours, Linear(min(Shown(behind) + added, 1)),
// and adds what that is above what was behind, through a blend of one and one. Sprites drawn over each other from the
// same copy add up their own share each, which is GoldSrc's sum but where they overlap (there a little less, as the
// screen's curve bends).
//
// ITS INPUT. Quads drawn from code (Graphics.Draw with s&box's Vertex): each corner's place in the world, its texture
// coordinates (TexCoord0's x and y), and the render colour as GoldSrc's (Color: its bytes, not undone by the sRGB
// curve). The texture (SpriteTexture) is read as its bytes too, as GoldSrc reads it. The depth tested, not written.

/** The shader's path in a project's Assets. */
export const ADDITIVE_SHADER = "shaders/smak_additive.shader";

/** The shader's text. */
export const additiveShader =
  () => `// Made by SMAK (src/sbox/additive.mjs): a texture added to the frame as GoldSrc adds it, on the screen's colours.
HEADER
{
	Description = "SMAK: GoldSrc additive";
	DevShader = false;
	Version = 1;
}

MODES
{
	Forward();
}

FEATURES
{
}

COMMON
{
	#include "system.fxc"
	#include "common.fxc"
}

struct VS_INPUT
{
	float3 vPositionWs : POSITION < Semantic( PosXyz ); >;
	float4 vColor : COLOR0 < Semantic( Color ); >;
	float4 vTexCoord : TEXCOORD0 < Semantic( LowPrecisionUv ); >;
};

struct PS_INPUT
{
	float4 vColor : COLOR0;
	float2 vTexCoord : TEXCOORD0;
	#if ( PROGRAM == VFX_PROGRAM_VS )
		float4 vPositionPs : SV_Position;
	#endif
	#if ( PROGRAM == VFX_PROGRAM_PS )
		float4 vPositionSs : SV_Position;
	#endif
};

VS
{
	PS_INPUT MainVs( const VS_INPUT i )
	{
		PS_INPUT o;
		o.vPositionPs = Position3WsToPs( i.vPositionWs );
		o.vColor = i.vColor;
		o.vTexCoord = i.vTexCoord.xy;
		return o;
	}
}

PS
{
	Texture2D g_tSprite < Attribute( "SpriteTexture" ); SrgbRead( false ); >;
	Texture2D g_tFrameBufferCopyTexture < Attribute( "FrameBufferCopyTexture" ); SrgbRead( false ); >;

	RenderState( CullMode, NONE );
	RenderState( DepthEnable, true );
	RenderState( DepthWriteEnable, false );
	RenderState( BlendEnable, true );
	RenderState( SrcBlend, ONE );
	RenderState( DstBlend, ONE );
	RenderState( BlendOp, ADD );
	RenderState( SrcBlendAlpha, ZERO );
	RenderState( DstBlendAlpha, ONE );

	// the sRGB curve each way: the screen's colour of a linear one, and back
	float3 Shown( float3 c ) { c = max( c, 0.0 ); return lerp( 1.055 * pow( c, 1.0 / 2.4 ) - 0.055, c * 12.92, step( c, 0.0031308 ) ); }
	float3 Linear( float3 s ) { s = max( s, 0.0 ); return lerp( pow( ( s + 0.055 ) / 1.055, 2.4 ), s / 12.92, step( s, 0.04045 ) ); }

	float4 MainPs( PS_INPUT i ) : SV_Target0
	{
		float3 added = g_tSprite.Sample( g_sBilinearClamp, i.vTexCoord ).rgb * i.vColor.rgb;
		float3 behind = g_tFrameBufferCopyTexture.SampleLevel( g_sPointClamp, i.vPositionSs.xy * g_vInvViewportSize, 0 ).rgb;
		float3 shown = min( Shown( behind ) + added, 1.0 );
		return float4( max( Linear( shown ) - behind, 0.0 ), 0.0 );
	}
}
`;

// GoldSrc's HUD in s&box: every part of it (FillRGBA's boxes, SPR_DrawAdditive's sprites, the text) is added to the
// screen's colours, each part on what the ones before left. As all of them add, their sum added once is the same, so
// a HUD is drawn in two steps (from a camera's command list, after the transparent pass: after the post-processing
// the frame is no longer in the screen's colours):
// - each part into a render target of its own (a float one, cleared to black), with HUD_SHADER: a quad in the
//   screen's pixels (Graphics.DrawQuad), its texture (SpriteTexture, read as its bytes, its alpha a cut-out; the part
//   of it SpriteRect gives, u0 v0 u1 v1, all of it unset) times its colour (its bytes: SPR_Set's colour, or
//   FillRGBA's times its alpha), added;
// - the text into a second target, drawn by s&box's own (a HudPainter: it has no additive blend, but text alone on
//   black leaves its colour times its cover, what an add of it adds);
// - then both targets (HudTexture, HudTextTexture) added to the frame with HUD_SCREEN_SHADER (Graphics.Blit), as
//   ADDITIVE_SHADER adds: Linear(min(Shown(behind) + hud, 1)) in place of what was behind, from a copy of the frame
//   (FrameBufferCopyTexture); first, while HudFade (r, g, b, alpha as shares of 255) has an alpha, GoldSrc's screen
//   fade (ScreenFade's: blended on the screen's colours, Shown(behind) x (1 - alpha) + colour x alpha) over all of it.

/** The HUD's shaders' paths: a part added into the HUD's target, and the target added to the frame. */
export const HUD_SHADER = "shaders/smak_hud.shader";
export const HUD_SCREEN_SHADER = "shaders/smak_hud_screen.shader";

/** HUD_SHADER's text. */
export const hudShader =
  () => `// Made by SMAK (src/sbox/additive.mjs): a part of a GoldSrc HUD added into the HUD's target.
HEADER
{
	Description = "SMAK: GoldSrc HUD part";
	DevShader = false;
	Version = 1;
}

MODES
{
	Default();
	Forward();
}

FEATURES
{
}

COMMON
{
	#include "system.fxc"
	#include "common.fxc"
}

struct VS_INPUT
{
	float3 vPositionSs : POSITION < Semantic( PosXyz ); >;
	float4 vColor : COLOR0 < Semantic( Color ); >;
	float4 vTexCoord : TEXCOORD0 < Semantic( LowPrecisionUv ); >;
};

struct PS_INPUT
{
	float4 vColor : COLOR0;
	float2 vTexCoord : TEXCOORD0;
	float4 vPositionPs : SV_Position;
};

VS
{
	float4 g_vViewport < Source( Viewport ); >;

	// a corner in the target's pixels, from its top left
	PS_INPUT MainVs( const VS_INPUT i )
	{
		PS_INPUT o;
		float2 p = 2.0 * ( i.vPositionSs.xy - g_vViewport.xy ) / g_vViewport.zw - 1.0;
		o.vPositionPs = float4( p.x, -p.y, 0.5, 1.0 );
		o.vColor = i.vColor;
		o.vTexCoord = i.vTexCoord.xy;
		return o;
	}
}

PS
{
	Texture2D g_tSprite < Attribute( "SpriteTexture" ); SrgbRead( false ); >;
	float4 g_vSpriteRect < Attribute( "SpriteRect" ); Default4( 0.0, 0.0, 1.0, 1.0 ); >;

	RenderState( CullMode, NONE );
	RenderState( DepthEnable, false );
	RenderState( DepthWriteEnable, false );
	RenderState( BlendEnable, true );
	RenderState( SrcBlend, ONE );
	RenderState( DstBlend, ONE );
	RenderState( BlendOp, ADD );
	RenderState( SrcBlendAlpha, ONE );
	RenderState( DstBlendAlpha, ONE );

	float4 MainPs( PS_INPUT i ) : SV_Target0
	{
		float4 t = g_tSprite.Sample( g_sPointClamp, lerp( g_vSpriteRect.xy, g_vSpriteRect.zw, i.vTexCoord ) );
		return float4( t.rgb * t.a * i.vColor.rgb, 0.0 );
	}
}
`;

/** HUD_SCREEN_SHADER's text. */
export const hudScreenShader =
  () => `// Made by SMAK (src/sbox/additive.mjs): a GoldSrc HUD's target added to the frame, on the screen's colours, over its
// screen fade.
HEADER
{
	Description = "SMAK: GoldSrc HUD added";
	DevShader = false;
	Version = 1;
}

MODES
{
	Default();
	Forward();
}

FEATURES
{
}

COMMON
{
	#include "system.fxc"
	#include "common.fxc"
}

struct VS_INPUT
{
	float3 vPositionPs : POSITION < Semantic( PosXyz ); >;
	float4 vTexCoord : TEXCOORD0 < Semantic( LowPrecisionUv ); >;
};

struct PS_INPUT
{
	#if ( PROGRAM == VFX_PROGRAM_VS )
		float4 vPositionPs : SV_Position;
	#endif
	#if ( PROGRAM == VFX_PROGRAM_PS )
		float4 vPositionSs : SV_Position;
	#endif
};

VS
{
	PS_INPUT MainVs( const VS_INPUT i )
	{
		PS_INPUT o;
		o.vPositionPs = float4( i.vPositionPs.xy, 0.5, 1.0 );
		return o;
	}
}

PS
{
	Texture2D g_tHud < Attribute( "HudTexture" ); SrgbRead( false ); >;
	Texture2D g_tHudText < Attribute( "HudTextTexture" ); SrgbRead( false ); >;
	Texture2D g_tFrameBufferCopyTexture < Attribute( "FrameBufferCopyTexture" ); SrgbRead( false ); >;
	float4 g_vFade < Attribute( "HudFade" ); Default4( 0.0, 0.0, 0.0, 0.0 ); >;

	RenderState( CullMode, NONE );
	RenderState( DepthEnable, false );
	RenderState( DepthWriteEnable, false );
	RenderState( BlendEnable, true );
	RenderState( SrcBlend, ONE );
	RenderState( DstBlend, ZERO );
	RenderState( BlendOp, ADD );
	RenderState( SrcBlendAlpha, ZERO );
	RenderState( DstBlendAlpha, ONE );

	float3 Shown( float3 c ) { c = max( c, 0.0 ); return lerp( 1.055 * pow( c, 1.0 / 2.4 ) - 0.055, c * 12.92, step( c, 0.0031308 ) ); }
	float3 Linear( float3 s ) { s = max( s, 0.0 ); return lerp( pow( ( s + 0.055 ) / 1.055, 2.4 ), s / 12.92, step( s, 0.04045 ) ); }

	float4 MainPs( PS_INPUT i ) : SV_Target0
	{
		float2 uv = i.vPositionSs.xy * g_vInvViewportSize;
		float3 hud = g_tHud.SampleLevel( g_sPointClamp, uv, 0 ).rgb + g_tHudText.SampleLevel( g_sPointClamp, uv, 0 ).rgb;
		if ( max( hud.r, max( hud.g, hud.b ) ) <= 0.0 && g_vFade.a <= 0.0 ) discard;
		float3 behind = g_tFrameBufferCopyTexture.SampleLevel( g_sPointClamp, uv, 0 ).rgb;
		float3 faded = lerp( min( Shown( behind ), 1.0 ), g_vFade.rgb, g_vFade.a );
		return float4( Linear( min( faded + hud, 1.0 ) ), 0.0 );
	}
}
`;

// A GoldSrc mask over the whole frame, as a scope's (TS's TS_DrawScopeOverlayHUD): a picture of one quarter of a circle
// (MaskTexture, read as its bytes; its uv 0, 0 the circle's outer corner, 1, 1 its centre) mirrored into the four
// quarters of the circle MaskCircle gives (x, y its centre in the screen's pixels, z its radius, w how far the bars
// overlap its edge), its colour blended over the frame by its alpha (kRenderTransAlpha), on the screen's colours;
// black either side of the circle's square. Drawn after the transparent pass, before the HUD.

/** HUD_MASK_SHADER's path. */
export const HUD_MASK_SHADER = "shaders/smak_hud_mask.shader";

/** HUD_MASK_SHADER's text. */
export const hudMaskShader =
  () => `// Made by SMAK (src/sbox/additive.mjs): a GoldSrc mask (a quarter mirrored into a circle, black either side) over the
// frame, on the screen's colours.
HEADER
{
	Description = "SMAK: GoldSrc screen mask";
	DevShader = false;
	Version = 1;
}

MODES
{
	Default();
	Forward();
}

FEATURES
{
}

COMMON
{
	#include "system.fxc"
	#include "common.fxc"
}

struct VS_INPUT
{
	float3 vPositionPs : POSITION < Semantic( PosXyz ); >;
	float4 vTexCoord : TEXCOORD0 < Semantic( LowPrecisionUv ); >;
};

struct PS_INPUT
{
	#if ( PROGRAM == VFX_PROGRAM_VS )
		float4 vPositionPs : SV_Position;
	#endif
	#if ( PROGRAM == VFX_PROGRAM_PS )
		float4 vPositionSs : SV_Position;
	#endif
};

VS
{
	PS_INPUT MainVs( const VS_INPUT i )
	{
		PS_INPUT o;
		o.vPositionPs = float4( i.vPositionPs.xy, 0.5, 1.0 );
		return o;
	}
}

PS
{
	Texture2D g_tMask < Attribute( "MaskTexture" ); SrgbRead( false ); >;
	Texture2D g_tFrameBufferCopyTexture < Attribute( "FrameBufferCopyTexture" ); SrgbRead( false ); >;
	// x, y the centre in pixels, z the radius, w the bars' overlap
	float4 g_vCircle < Attribute( "MaskCircle" ); Default4( 0.0, 0.0, 1.0, 2.0 ); >;

	RenderState( CullMode, NONE );
	RenderState( DepthEnable, false );
	RenderState( DepthWriteEnable, false );
	RenderState( BlendEnable, true );
	RenderState( SrcBlend, ONE );
	RenderState( DstBlend, ZERO );
	RenderState( BlendOp, ADD );
	RenderState( SrcBlendAlpha, ZERO );
	RenderState( DstBlendAlpha, ONE );

	float3 Shown( float3 c ) { c = max( c, 0.0 ); return lerp( 1.055 * pow( c, 1.0 / 2.4 ) - 0.055, c * 12.92, step( c, 0.0031308 ) ); }
	float3 Linear( float3 s ) { s = max( s, 0.0 ); return lerp( pow( ( s + 0.055 ) / 1.055, 2.4 ), s / 12.92, step( s, 0.04045 ) ); }

	float4 MainPs( PS_INPUT i ) : SV_Target0
	{
		float2 px = i.vPositionSs.xy;
		float r = g_vCircle.z;
		float left = floor( g_vCircle.x - r );
		float right = floor( g_vCircle.x + r );
		// the bars either side
		if ( px.x < left + g_vCircle.w || px.x >= right - g_vCircle.w ) return float4( 0.0, 0.0, 0.0, 0.0 );
		// the quarter: its outer corner (uv 0, 0) at each corner of the circle's square, uv 1, 1 at the centre
		float2 uv = saturate( 1.0 - abs( px - g_vCircle.xy ) / r );
		float4 mask = g_tMask.SampleLevel( g_sBilinearClamp, uv, 0 );
		float3 behind = g_tFrameBufferCopyTexture.SampleLevel( g_sPointClamp, px * g_vInvViewportSize, 0 ).rgb;
		float3 shown = lerp( min( Shown( behind ), 1.0 ), mask.rgb, mask.a );
		return float4( Linear( shown ), 0.0 );
	}
}
`;

/*{
    "DESCRIPTION": "Simple wave test",
    "CREDIT": "glsl2godot test",
    "CATEGORIES": ["Generator"],
    "INPUTS": [
        { "NAME": "speed", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 5.0 },
        { "NAME": "tint", "TYPE": "color", "DEFAULT": [1.0, 0.5, 0.2, 1.0] },
        { "NAME": "center", "TYPE": "point2D", "DEFAULT": [0.5, 0.5] },
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "invert", "TYPE": "bool", "DEFAULT": false }
    ]
}*/

void main() {
    vec2 uv = isf_FragNormCoord;
    float d = distance(uv, center);
    float w = sin(d * 40.0 - TIME * speed) * 0.5 + 0.5;
    vec4 src = IMG_NORM_PIXEL(inputImage, uv);
    vec4 c = mix(src, tint, w);
    if (invert) c.rgb = 1.0 - c.rgb;
    gl_FragColor = c * (RENDERSIZE.x > 0 ? 1 : 0);
}

/*{
    "DESCRIPTION": "Ondes concentriques qui se mélangent à l'image d'entrée",
    "CREDIT": "glsl2godot",
    "ISFVSN": "2",
    "CATEGORIES": ["Generator"],
    "INPUTS": [
        { "NAME": "speed", "TYPE": "float", "DEFAULT": 2.0, "MIN": 0.0, "MAX": 10.0 },
        { "NAME": "rings", "TYPE": "float", "DEFAULT": 30.0, "MIN": 1.0, "MAX": 100.0 },
        { "NAME": "tint", "TYPE": "color", "DEFAULT": [1.0, 0.45, 0.2, 1.0] },
        { "NAME": "center", "TYPE": "point2D", "DEFAULT": [0.5, 0.5] },
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "invert", "TYPE": "bool", "DEFAULT": false }
    ]
}*/

void main() {
    vec2 uv = isf_FragNormCoord;
    float d = distance(uv, center);
    float w = sin(d * rings - TIME * speed) * 0.5 + 0.5;
    vec4 src = IMG_NORM_PIXEL(inputImage, uv);
    vec4 c = mix(src, tint, w);
    if (invert) c.rgb = 1.0 - c.rgb;
    gl_FragColor = c;
}

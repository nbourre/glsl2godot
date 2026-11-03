#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform vec3 uTint;

const float PI = 3.1415926;
float instance = 2.0;

void main() {
    vec2 uv = vUv;
    uv.x += sin(uv.y * 10. + uTime) * 0.02 * instance;
    vec4 tex = texture(uTexture, uv);
    outColor = vec4(tex.rgb * uTint, tex.a) * cos(PI * 0);
}

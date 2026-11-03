const float TAU = 6.2831853;
const float PI = 3.0;
vec3 COLOR = vec3(1.0, 0.5, 0.0);

float global(float smoothstep_, float render_mode) {
    return smoothstep_ * render_mode;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 UV = fragCoord / iResolution.xy;
    float instance = global(UV.x, TAU / PI);
    fragColor = vec4(COLOR * instance, 1);
}

#ifdef GL_ES
precision mediump float;
#endif

#define PI 3.14159265359

uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;

// Trace une ligne sur l'axe y à partir d'une valeur entre 0 et 1
float plot(vec2 st, float pct) {
    return smoothstep(pct - 0.02, pct, st.y) -
           smoothstep(pct, pct + 0.02, st.y);
}

void main() {
    vec2 st = gl_FragCoord.xy / u_resolution;

    float y = pow(st.x, 5.0) + sin(u_time * PI * 0.5 + st.x * 6.0) * 0.1;

    vec3 color = vec3(st.x, 0.3, 1.0 - st.y) * 0.6;
    float pct = plot(st, y);
    color = (1.0 - pct) * color + pct * vec3(0.2, 1.0, 0.4);

    gl_FragColor = vec4(color, 1.0);
}

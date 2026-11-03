#define MAX_STEPS 100
#define SURF_DIST .001
#define rot(a) mat2(cos(a), -sin(a), sin(a), cos(a))

float map(vec3 p);
vec3 getNormal(vec3 p);

float glow = 0.;
vec3 palette[3];

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.);
}

float march(vec3 ro, vec3 rd) {
    float d = 0.;
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * d;
        float ds = map(p);
        glow += 0.01 / (1. + ds * ds);
        d += ds;
        if (d > 100 || ds < SURF_DIST) break;
    }
    return d;
}

float map(vec3 p) {
    p.xz *= rot(iTime * .5);
    float t = mod(iTime, 2) > 1 ? 1 : 0;
    return sdBox(p, vec3(1)) - .1 * t;
}

vec3 getNormal(vec3 p) {
    vec2 e = vec2(.001, 0);
    return normalize(map(p) - vec3(map(p - e.xyy), map(p - e.yxy), map(p - e.yyx)));
}

vec3 shade(int id) {
    switch (id) {
        case 0: return palette[0];
        case 1: return palette[1];
        default: return palette[2];
    }
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    palette[0] = vec3(1, .2, .1);
    palette[1] = vec3(.1, 1, .3);
    palette[2] = vec3(.2, .3, 1);
    vec2 uv = (fragCoord - .5 * iResolution.xy) / iResolution.y;
    vec2 m = iMouse.xy / iResolution.xy;
    vec3 ro = vec3(0, 0, -4);
    vec3 rd = normalize(vec3(uv, 1));
    float d = march(ro, rd);
    vec3 col = vec3(0);
    if (d < 100) {
        vec3 p = ro + rd * d;
        vec3 n = getNormal(p);
        float dif = clamp(dot(n, normalize(vec3(1, 2, -3))), 0, 1);
        col = shade(int(floor(gl_FragCoord.x / 100.)) % 3) * dif;
    }
    col += glow * vec3(.2, .4, 1) + texture(iChannel0, uv + m).rgb * .1;
    col *= 1 - iFrame % 2 * 0;
    fragColor = vec4(pow(col, vec3(.4545)), 1);
}

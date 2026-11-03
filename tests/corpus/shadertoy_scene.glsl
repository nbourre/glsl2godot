// Petite scène en raymarching : sphère, sol en damier, lumière qui tourne.
// Clique et glisse dans l'aperçu pour bouger la caméra.

#define MAX_STEPS 96
#define MAX_DIST 40.0
#define SURF 0.001

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float map(vec3 p, out float mat) {
    float sphere = length(p - vec3(0.0, 1.0 + 0.2 * sin(iTime * 2.0), 0.0)) - 1.0;
    float plane = p.y;
    mat = sphere < plane ? 1.0 : 0.0;
    return min(sphere, plane);
}

float march(vec3 ro, vec3 rd, out float mat) {
    float d = 0.0;
    mat = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
        float ds = map(ro + rd * d, mat);
        d += ds;
        if (d > MAX_DIST || abs(ds) < SURF) break;
    }
    return d;
}

vec3 normalAt(vec3 p) {
    float m;
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(
        map(p + e.xyy, m) - map(p - e.xyy, m),
        map(p + e.yxy, m) - map(p - e.yxy, m),
        map(p + e.yyx, m) - map(p - e.yyx, m)));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    vec2 m = iMouse.z > 0.0 ? (iMouse.xy / iResolution.xy - 0.5) * 3.0 : vec2(0.0);

    vec3 ro = vec3(0.0, 2.0, -5.0);
    ro.xz *= rot(m.x + iTime * 0.15);
    vec3 target = vec3(0.0, 1.0, 0.0);
    vec3 fw = normalize(target - ro);
    vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
    vec3 up = cross(fw, rt);
    vec3 rd = normalize(uv.x * rt + (uv.y - m.y * 0.3) * up + 1.5 * fw);

    float mat;
    float d = march(ro, rd, mat);
    vec3 sky = mix(vec3(0.9, 0.55, 0.75), vec3(0.25, 0.55, 0.9), clamp(rd.y * 2.0 + 0.4, 0.0, 1.0));
    vec3 col = sky;

    if (d < MAX_DIST) {
        vec3 p = ro + rd * d;
        vec3 n = normalAt(p);
        vec3 l = normalize(vec3(cos(iTime), 1.2, sin(iTime)));
        float dif = clamp(dot(n, l), 0.0, 1.0);
        float sm;
        float sh = march(p + n * 0.01, l, sm) < MAX_DIST ? 0.35 : 1.0;
        vec3 base = mat > 0.5
            ? vec3(0.95, 0.8, 0.35)
            : mix(vec3(0.15, 0.17, 0.25), vec3(0.8), mod(floor(p.x) + floor(p.z), 2.0));
        col = base * (0.2 + 0.8 * dif * sh);
        col = mix(col, sky, 1.0 - exp(-0.0025 * d * d));
    }

    fragColor = vec4(pow(col, vec3(0.4545)), 1.0);
}
